import { describe, it, expect } from "vitest";
import { validateR2rmlMapping } from "./validate";

// ── Fixtures ──────────────────────────────────────────────────────────────────
//
// These are realistic, production-scale R2RML mappings — more complex than the
// inline snippets in the unit tests. They exercise the full parser path.

const FULL_CUSTOMER_ORDER_MAPPING = `
@prefix rr:  <http://www.w3.org/ns/r2rml#> .
@prefix ex:  <http://example.org/ontology/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# ── Customer ─────────────────────────────────────────────────────────────────
<#CustomerMap>
  rr:logicalTable [ rr:tableName "Customer" ] ;
  rr:subjectMap [
    rr:template "http://example.org/Customer/{customer_id}" ;
    rr:class ex:Customer
  ] ;
  rr:predicateObjectMap [
    rr:predicate ex:name ;
    rr:objectMap  [ rr:column "name" ]
  ] ;
  rr:predicateObjectMap [
    rr:predicate ex:email ;
    rr:objectMap  [ rr:column "email" ]
  ] ;
  rr:predicateObjectMap [
    rr:predicate ex:registeredAt ;
    rr:objectMap  [ rr:column "created_at" ; rr:datatype xsd:dateTime ]
  ] .

# ── Order ─────────────────────────────────────────────────────────────────────
<#OrderMap>
  rr:logicalTable [ rr:tableName "Order" ] ;
  rr:subjectMap [
    rr:template "http://example.org/Order/{order_id}" ;
    rr:class ex:Order
  ] ;
  rr:predicateObjectMap [
    rr:predicate ex:total ;
    rr:objectMap  [ rr:column "total" ; rr:datatype xsd:decimal ]
  ] ;
  rr:predicateObjectMap [
    rr:predicate ex:placedBy ;
    rr:objectMap [
      rr:parentTriplesMap <#CustomerMap> ;
      rr:joinCondition [
        rr:child  "customer_id" ;
        rr:parent "customer_id"
      ]
    ]
  ] .

# ── OrderItem ─────────────────────────────────────────────────────────────────
<#OrderItemMap>
  rr:logicalTable [ rr:tableName "OrderItem" ] ;
  rr:subjectMap [
    rr:template "http://example.org/OrderItem/{item_id}" ;
    rr:class ex:OrderItem
  ] ;
  rr:predicateObjectMap [
    rr:predicate ex:quantity ;
    rr:objectMap  [ rr:column "quantity" ; rr:datatype xsd:integer ]
  ] ;
  rr:predicateObjectMap [
    rr:predicate ex:partOf ;
    rr:objectMap [
      rr:parentTriplesMap <#OrderMap> ;
      rr:joinCondition [
        rr:child  "order_id" ;
        rr:parent "order_id"
      ]
    ]
  ] .

# ── Product ───────────────────────────────────────────────────────────────────
<#ProductMap>
  rr:logicalTable [ rr:tableName "Product" ] ;
  rr:subjectMap [
    rr:template "http://example.org/Product/{product_id}" ;
    rr:class ex:Product
  ] ;
  rr:predicateObjectMap [
    rr:predicate ex:productName ;
    rr:objectMap  [ rr:column "product_name" ]
  ] ;
  rr:predicateObjectMap [
    rr:predicate ex:price ;
    rr:objectMap  [ rr:column "price" ; rr:datatype xsd:decimal ]
  ] .

# ── Category ──────────────────────────────────────────────────────────────────
<#CategoryMap>
  rr:logicalTable [ rr:tableName "Category" ] ;
  rr:subjectMap [
    rr:template "http://example.org/Category/{category_id}" ;
    rr:class ex:Category
  ] ;
  rr:predicateObjectMap [
    rr:predicate ex:categoryName ;
    rr:objectMap  [ rr:column "category_name" ]
  ] .
`;

const FULL_DB_SCHEMA = {
    tables: [
        {
            name: "Customer",
            columns: [
                { name: "customer_id" },
                { name: "name" },
                { name: "email" },
                { name: "created_at" },
            ],
        },
        {
            name: "Order",
            columns: [
                { name: "order_id" },
                { name: "customer_id" },
                { name: "total" },
            ],
        },
        {
            name: "OrderItem",
            columns: [
                { name: "item_id" },
                { name: "order_id" },
                { name: "quantity" },
            ],
        },
        {
            name: "Product",
            columns: [
                { name: "product_id" },
                { name: "product_name" },
                { name: "price" },
            ],
        },
        {
            name: "Category",
            columns: [
                { name: "category_id" },
                { name: "category_name" },
            ],
        },
    ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("validateR2rmlMapping — realistic fixture", () => {
    it("validates the full 5-TriplesMap customer/order mapping with no errors", async () => {
        const start = Date.now();
        const result = await validateR2rmlMapping(FULL_CUSTOMER_ORDER_MAPPING);
        const elapsed = Date.now() - start;

        expect(result.valid).toBe(true);
        expect(result.issues.filter((i) => i.level === "error")).toHaveLength(0);
        // Performance: should complete within 500ms even for large mappings
        expect(elapsed).toBeLessThan(500);
    });

    it("detects all 5 TriplesMap entries in stats", async () => {
        const result = await validateR2rmlMapping(FULL_CUSTOMER_ORDER_MAPPING);
        expect(result.stats.triplesMaps.length).toBe(5);
    });

    it("lists all referenced table names in stats", async () => {
        const result = await validateR2rmlMapping(FULL_CUSTOMER_ORDER_MAPPING);
        expect(result.stats.referencedTables).toContain("Customer");
        expect(result.stats.referencedTables).toContain("Order");
        expect(result.stats.referencedTables).toContain("OrderItem");
        expect(result.stats.referencedTables).toContain("Product");
        expect(result.stats.referencedTables).toContain("Category");
    });

    it("validates parentTriplesMap cross-references inside the fixture", async () => {
        const result = await validateR2rmlMapping(FULL_CUSTOMER_ORDER_MAPPING);
        const parentErrors = result.issues.filter(
            (i) => i.level === "error" && i.message.includes("parentTriplesMap")
        );
        expect(parentErrors).toHaveLength(0);
    });

    it("passes DB schema cross-check when the schema matches the mapping exactly", async () => {
        const result = await validateR2rmlMapping(FULL_CUSTOMER_ORDER_MAPPING, FULL_DB_SCHEMA);
        expect(result.valid).toBe(true);
        expect(result.issues.filter((i) => i.level === "error")).toHaveLength(0);
    });

    it("errors when a table in the mapping is missing from the DB schema", async () => {
        // Provide a schema that is missing the 'Product' table
        const partialSchema = {
            tables: FULL_DB_SCHEMA.tables.filter((t) => t.name !== "Product"),
        };
        const result = await validateR2rmlMapping(FULL_CUSTOMER_ORDER_MAPPING, partialSchema);
        expect(result.valid).toBe(false);
        expect(
            result.issues.some((i) => i.level === "error" && i.message.includes("Product"))
        ).toBe(true);
    });

    it("warns when a column is missing from the DB schema but keeps valid=true (only error-level blocks)", async () => {
        // Schema has 'Customer' table but is missing the 'email' column
        const schemaWithMissingCol = {
            tables: FULL_DB_SCHEMA.tables.map((t) =>
                t.name === "Customer"
                    ? { ...t, columns: t.columns.filter((c) => c.name !== "email") }
                    : t
            ),
        };
        const result = await validateR2rmlMapping(FULL_CUSTOMER_ORDER_MAPPING, schemaWithMissingCol);
        const columnWarning = result.issues.find(
            (i) => i.level === "warning" && i.message.toLowerCase().includes("email")
        );
        expect(columnWarning).toBeDefined();
    });
});
