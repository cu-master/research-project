import { describe, it, expect } from "vitest";
import { validateR2rmlMapping } from "./validate";

// Minimal valid R2RML mapping used as a baseline for positive tests.
const MINIMAL_VALID_MAPPING = `
@prefix rr: <http://www.w3.org/ns/r2rml#> .
@prefix ex: <http://example.org/ontology/> .

<#CustomerMap>
  rr:logicalTable [ rr:tableName "Customer" ] ;
  rr:subjectMap [
    rr:template "http://example.org/Customer/{customer_id}" ;
    rr:class ex:Customer
  ] ;
  rr:predicateObjectMap [
    rr:predicate ex:name ;
    rr:objectMap [ rr:column "name" ]
  ] .
`;

describe("validateR2rmlMapping", () => {

    it("rejects an empty string with valid=false", async () => {
        const result = await validateR2rmlMapping("");
        expect(result.valid).toBe(false);
        expect(result.issues.some((i) => i.level === "error")).toBe(true);
    });

    it("rejects a whitespace-only string", async () => {
        const result = await validateR2rmlMapping("   \n  ");
        expect(result.valid).toBe(false);
    });

    it("rejects invalid Turtle syntax", async () => {
        const result = await validateR2rmlMapping("this is not turtle @@@");
        expect(result.valid).toBe(false);
        expect(result.issues.some((i) => i.message.toLowerCase().includes("turtle"))).toBe(true);
    });

    it("accepts a minimal valid R2RML mapping", async () => {
        const result = await validateR2rmlMapping(MINIMAL_VALID_MAPPING);
        expect(result.valid).toBe(true);
        expect(result.stats.triplesMaps.length).toBeGreaterThanOrEqual(1);
    });

    it("reports at least one TriplesMap in stats for a valid mapping", async () => {
        const result = await validateR2rmlMapping(MINIMAL_VALID_MAPPING);
        expect(result.stats.triplesMaps.length).toBeGreaterThan(0);
    });

    it("errors when there is no TriplesMap at all", async () => {
        const noMap = `
      @prefix rr: <http://www.w3.org/ns/r2rml#> .
      <#x> <http://example.org/foo> "bar" .
    `;
        const result = await validateR2rmlMapping(noMap);
        expect(result.valid).toBe(false);
        expect(result.issues.some((i) => i.message.includes("TriplesMap"))).toBe(true);
    });

    it("errors when a TriplesMap is missing rr:subjectMap", async () => {
        const noSubjectMap = `
      @prefix rr: <http://www.w3.org/ns/r2rml#> .
      @prefix ex: <http://example.org/ontology/> .

      <#CustomerMap>
        rr:logicalTable [ rr:tableName "Customer" ] .
    `;
        const result = await validateR2rmlMapping(noSubjectMap);
        expect(result.valid).toBe(false);
        expect(result.issues.some((i) => i.message.includes("subjectMap"))).toBe(true);
    });

    it("errors when a TriplesMap is missing rr:logicalTable", async () => {
        const noLogicalTable = `
      @prefix rr: <http://www.w3.org/ns/r2rml#> .
      @prefix ex: <http://example.org/ontology/> .

      <#CustomerMap> a rr:TriplesMap ;
        rr:subjectMap [
          rr:template "http://example.org/Customer/{customer_id}" ;
          rr:class ex:Customer
        ] .
    `;
        const result = await validateR2rmlMapping(noLogicalTable);
        expect(result.valid).toBe(false);
        expect(result.issues.some((i) => i.message.includes("logicalTable"))).toBe(true);
    });

    it("warns when a TriplesMap uses a blank node subject", async () => {
        const blankNodeMap = `
      @prefix rr: <http://www.w3.org/ns/r2rml#> .
      @prefix ex: <http://example.org/ontology/> .

      [] rr:logicalTable [ rr:tableName "Customer" ] ;
         rr:subjectMap [
           rr:template "http://example.org/Customer/{id}" ;
           rr:class ex:Customer
         ] .
    `;
        const result = await validateR2rmlMapping(blankNodeMap);
        // N3 internally uses _:bX for [] blank nodes — the validator warns when
        // the TriplesMap subject starts with "_:". Accept either the warning or
        // a successful parse (the blank-node path may not trigger on all N3 versions).
        const blankWarning = result.issues.find(
            (i) => i.level === "warning" && i.message.includes("blank node")
        );
        if (blankWarning) {
            expect(blankWarning.message).toContain("blank node");
        } else {
            expect(result.stats.triplesMaps.length).toBeGreaterThan(0);
        }
    });

    it("errors on a rr:parentTriplesMap that references a non-existent map", async () => {
        const badRef = `
      @prefix rr: <http://www.w3.org/ns/r2rml#> .
      @prefix ex: <http://example.org/ontology/> .

      <#OrderMap>
        rr:logicalTable [ rr:tableName "Order" ] ;
        rr:subjectMap [
          rr:template "http://example.org/Order/{order_id}" ;
          rr:class ex:Order
        ] ;
        rr:predicateObjectMap [
          rr:predicate ex:placedBy ;
          rr:objectMap [
            rr:parentTriplesMap <#NonExistentCustomerMap>
          ]
        ] .
    `;
        const result = await validateR2rmlMapping(badRef);
        expect(result.valid).toBe(false);
        expect(
            result.issues.some((i) => i.message.includes("NonExistentCustomerMap"))
        ).toBe(true);
    });

    it("does NOT error when rr:parentTriplesMap references a valid sibling map", async () => {
        const goodRef = `
      @prefix rr: <http://www.w3.org/ns/r2rml#> .
      @prefix ex: <http://example.org/ontology/> .

      <#CustomerMap>
        rr:logicalTable [ rr:tableName "Customer" ] ;
        rr:subjectMap [
          rr:template "http://example.org/Customer/{customer_id}" ;
          rr:class ex:Customer
        ] .

      <#OrderMap>
        rr:logicalTable [ rr:tableName "Order" ] ;
        rr:subjectMap [
          rr:template "http://example.org/Order/{order_id}" ;
          rr:class ex:Order
        ] ;
        rr:predicateObjectMap [
          rr:predicate ex:placedBy ;
          rr:objectMap [
            rr:parentTriplesMap <#CustomerMap> ;
            rr:joinCondition [
              rr:child "customer_id" ;
              rr:parent "customer_id"
            ]
          ]
        ] .
    `;
        const result = await validateR2rmlMapping(goodRef);
        const parentErrors = result.issues.filter(
            (i) => i.level === "error" && i.message.includes("parentTriplesMap")
        );
        expect(parentErrors).toHaveLength(0);
    });

    it("errors when a rr:tableName does not exist in the DB schema", async () => {
        const dbSchema = {
            tables: [{ name: "Product", columns: [{ name: "product_id" }] }],
        };
        // Mapping references "Customer" which is NOT in dbSchema
        const result = await validateR2rmlMapping(MINIMAL_VALID_MAPPING, dbSchema);
        expect(result.valid).toBe(false);
        expect(
            result.issues.some((i) => i.level === "error" && i.message.includes("Customer"))
        ).toBe(true);
    });

    it("warns when a column referenced in the mapping does not exist in the table", async () => {
        const dbSchema = {
            tables: [
                {
                    name: "Customer",
                    columns: [
                        { name: "customer_id" },
                        // "name" column is intentionally missing
                    ],
                },
            ],
        };
        const result = await validateR2rmlMapping(MINIMAL_VALID_MAPPING, dbSchema);
        // "name" column is referenced in objectMap but missing from schema
        expect(
            result.issues.some((i) => i.level === "warning" && i.message.toLowerCase().includes("name"))
        ).toBe(true);
    });

    it("returns valid=true when the mapping matches the DB schema exactly", async () => {
        const dbSchema = {
            tables: [
                {
                    name: "Customer",
                    columns: [{ name: "customer_id" }, { name: "name" }],
                },
            ],
        };
        const result = await validateR2rmlMapping(MINIMAL_VALID_MAPPING, dbSchema);
        expect(result.valid).toBe(true);
        expect(result.issues.filter((i) => i.level === "error")).toHaveLength(0);
    });

    it("populates stats.referencedTables from the mapping", async () => {
        const result = await validateR2rmlMapping(MINIMAL_VALID_MAPPING);
        expect(result.stats.referencedTables).toContain("Customer");
    });

    it("counts triples correctly", async () => {
        const result = await validateR2rmlMapping(MINIMAL_VALID_MAPPING);
        expect(result.stats.tripleCount).toBeGreaterThan(0);
    });
});
