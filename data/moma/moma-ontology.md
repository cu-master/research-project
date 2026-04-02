# MoMA Collection Ontology

**Namespace:** `https://moma.org/ontology/`  
**Version:** 1.0.0

Semantic vocabulary for the Museum of Modern Art collection management system, covering artworks, artists, exhibitions, acquisitions, loans, provenance, conservation and media.

**Prefixes used:**

| Prefix | URI |
|--------|-----|
| `moma:` | `https://moma.org/ontology/` |
| `rdf:` | `http://www.w3.org/1999/02/22-rdf-syntax-ns#` |
| `rdfs:` | `http://www.w3.org/2000/01/rdf-schema#` |
| `owl:` | `http://www.w3.org/2002/07/owl#` |
| `xsd:` | `http://www.w3.org/2001/XMLSchema#` |
| `dcterms:` | `http://purl.org/dc/terms/` |
| `skos:` | `http://www.w3.org/2004/02/skos/core#` |

---

## Classes

### `moma:Artwork`
A physical or digital object held in the MoMA collection, identified by a unique accession number.

### `moma:Artist`
A person or group credited with the creation of one or more artworks in the collection.

### `moma:ArtworkCredit`
An attribution linking an artist to an artwork, specifying their role and display order when multiple creators are credited.

### `moma:Department`
A curatorial division of the museum (e.g. Photography, Painting and Sculpture) that owns artworks and organises exhibitions.

### `moma:Location`
A physical place within the museum — a named gallery on a specific floor and wing, or a storage facility.

### `moma:Exhibition`
A named show presented by the museum, with defined start and end dates and an organising department.

### `moma:ExhibitionPresentation`
The appearance of a specific artwork within a specific exhibition, including its display dates and wall label text.

### `moma:Loan`
An outgoing loan of an artwork to an external institution, tracked from dispatch to return.

### `moma:Acquisition`
The event by which an artwork officially entered the MoMA collection, recording method, source, price and funding.

### `moma:ProvenanceRecord`
A single link in the ownership chain of an artwork, covering one prior owner and the period of their ownership.

### `moma:ConservationRecord`
A formal examination or treatment report for an artwork, filed by a conservator.

### `moma:Conservator`
A museum staff member who examines and treats artworks; each has a named specialisation.

### `moma:MediaAsset`
A digital file (photograph, video, 3D scan) associated with an artwork.

---

## Object Properties

Object properties link instances of classes to one another.

### Artwork ↔ Artist (via ArtworkCredit)

| Property | Domain | Range | Description |
|----------|--------|-------|-------------|
| `moma:creditedArtwork` | `ArtworkCredit` | `Artwork` | The artwork to which this credit record belongs. |
| `moma:creditedArtist` | `ArtworkCredit` | `Artist` | The artist named in this credit record. |
| `moma:hasCredit` | `Artwork` | `ArtworkCredit` | Links an artwork to one of its attribution records. Inverse of `creditedArtwork`. |

### Artwork → Department / Location

| Property | Domain | Range | Description |
|----------|--------|-------|-------------|
| `moma:belongsToDepartment` | `Artwork` | `Department` | The curatorial department responsible for this artwork. |
| `moma:currentLocation` | `Artwork` | `Location` | The gallery or storage area where the artwork is currently held. |

### Exhibition

| Property | Domain | Range | Description |
|----------|--------|-------|-------------|
| `moma:organisedBy` | `Exhibition` | `Department` | The department responsible for staging this exhibition. |
| `moma:featuredIn` | `Artwork` | `ExhibitionPresentation` | Links an artwork to a presentation record within an exhibition. |
| `moma:presentationExhibition` | `ExhibitionPresentation` | `Exhibition` | The exhibition in which this presentation took place. |
| `moma:presentationArtwork` | `ExhibitionPresentation` | `Artwork` | The artwork shown in this presentation. |

### Loan

| Property | Domain | Range | Description |
|----------|--------|-------|-------------|
| `moma:loanedArtwork` | `Loan` | `Artwork` | The artwork that is the subject of this loan. |

### Acquisition

| Property | Domain | Range | Description |
|----------|--------|-------|-------------|
| `moma:acquiredArtwork` | `Acquisition` | `Artwork` | The artwork brought into the collection via this acquisition. |
| `moma:supportedByProvenance` | `Acquisition` | `ProvenanceRecord` | The provenance record that validated ownership history for this acquisition. |

### Provenance

| Property | Domain | Range | Description |
|----------|--------|-------|-------------|
| `moma:provenanceOf` | `ProvenanceRecord` | `Artwork` | The artwork whose ownership history this record describes. |

### Conservation

| Property | Domain | Range | Description |
|----------|--------|-------|-------------|
| `moma:conservationOf` | `ConservationRecord` | `Artwork` | The artwork examined or treated in this conservation record. |
| `moma:filedBy` | `ConservationRecord` | `Conservator` | The conservator who conducted the examination and wrote this record. |

### Media

| Property | Domain | Range | Description |
|----------|--------|-------|-------------|
| `moma:mediaOf` | `MediaAsset` | `Artwork` | The artwork this media asset documents. |

### Department

| Property | Domain | Range | Description |
|----------|--------|-------|-------------|
| `moma:headCurator` | `Department` | `Artist` | The artist/constituent record for the curator who leads this department. |

---

## Datatype Properties

Datatype properties define literal attributes on class instances.

### Artwork

| Property | Range | Description |
|----------|-------|-------------|
| `moma:objectId` | `xsd:integer` | Unique numeric identifier for the artwork in the MoMA collection database. |
| `moma:title` | `xsd:string` | The title of the artwork as catalogued. |
| `moma:medium` | `xsd:string` | The materials and techniques used to create the artwork (e.g. "Oil on canvas"). |
| `moma:classification` | `xsd:string` | Broad category assigned by the museum (e.g. Painting, Photograph, Print). |
| `moma:artworkDate` | `xsd:string` | The date or date range when the artwork was created, as a free-text string. |
| `moma:dimensions` | `xsd:string` | Human-readable description of the artwork's physical dimensions. |
| `moma:accessionNumber` | `xsd:string` | The museum's unique registration code for this object. |
| `moma:creditLine` | `xsd:string` | The formal attribution text used in catalogue entries and wall labels. |
| `moma:onView` | `xsd:boolean` | Whether the artwork is currently on public display. |
| `moma:momaUrl` | `xsd:anyURI` | URL of the artwork's page on the MoMA website. |
| `moma:heightCm` | `xsd:decimal` | Height in centimetres. |
| `moma:widthCm` | `xsd:decimal` | Width in centimetres. |
| `moma:depthCm` | `xsd:decimal` | Depth in centimetres. |
| `moma:weightKg` | `xsd:decimal` | Weight in kilograms. |
| `moma:durationSec` | `xsd:integer` | For time-based media: total running time in seconds. |

### Artist

| Property | Range | Description |
|----------|-------|-------------|
| `moma:constituentId` | `xsd:integer` | Unique numeric identifier for the artist in the MoMA constituent database. |
| `moma:artistName` | `xsd:string` | Display name of the artist. |
| `moma:biography` | `xsd:string` | Biographical text. |
| `moma:nationality` | `xsd:string` | Artist's nationality. |
| `moma:gender` | `xsd:string` | Artist's gender. |
| `moma:birthYear` | `xsd:gYear` | Year of birth. |
| `moma:deathYear` | `xsd:gYear` | Year of death. |
| `moma:wikiQid` | `xsd:string` | Wikidata entity identifier (e.g. Q5598). |
| `moma:ulanId` | `xsd:string` | Getty Union List of Artist Names identifier. |

### ArtworkCredit

| Property | Range | Description |
|----------|-------|-------------|
| `moma:creditRole` | `xsd:string` | The creator's role for this artwork (e.g. Artist, Architect, Designer, Manufacturer). |
| `moma:displayOrder` | `xsd:integer` | Integer controlling the order in which credited artists are listed. |

### Department

| Property | Range | Description |
|----------|-------|-------------|
| `moma:departmentId` | `xsd:integer` | Unique department identifier. |
| `moma:departmentName` | `xsd:string` | Name of the department. |
| `moma:departmentDescription` | `xsd:string` | Description of the department. |

### Location

| Property | Range | Description |
|----------|-------|-------------|
| `moma:locationId` | `xsd:integer` | Unique location identifier. |
| `moma:galleryName` | `xsd:string` | Name of the gallery. |
| `moma:floor` | `xsd:string` | Floor within the building. |
| `moma:wing` | `xsd:string` | Wing of the building. |
| `moma:building` | `xsd:string` | Building name. |
| `moma:isStorage` | `xsd:boolean` | True if this location is a storage facility not open to the public. |

### Exhibition

| Property | Range | Description |
|----------|-------|-------------|
| `moma:exhibitionId` | `xsd:integer` | Unique exhibition identifier. |
| `moma:exhibitionTitle` | `xsd:string` | Title of the exhibition. |
| `moma:startDate` | `xsd:date` | Opening date. |
| `moma:endDate` | `xsd:date` | Closing date. |
| `moma:venue` | `xsd:string` | Name of the host institution if the exhibition travels outside MoMA. |
| `moma:curator` | `xsd:string` | Free-text name of the lead curator for this exhibition. |

### ExhibitionPresentation

| Property | Range | Description |
|----------|-------|-------------|
| `moma:displayStart` | `xsd:date` | Date the artwork went on display. |
| `moma:displayEnd` | `xsd:date` | Date the artwork came off display. |
| `moma:wallLabel` | `xsd:string` | The interpretive text displayed beside the artwork in this exhibition. |

### Loan

| Property | Range | Description |
|----------|-------|-------------|
| `moma:loanId` | `xsd:integer` | Unique loan identifier. |
| `moma:borrowingInstitution` | `xsd:string` | Name of the institution borrowing the artwork. |
| `moma:loanStart` | `xsd:date` | Date the loan begins. |
| `moma:loanEnd` | `xsd:date` | Date the loan ends. |
| `moma:loanStatus` | `xsd:string` | Current status of the loan: pending, active, returned, cancelled. |
| `moma:insuranceValue` | `xsd:string` | Declared insurance value for the loan period. |
| `moma:conditionOut` | `xsd:string` | Condition assessment at departure. |
| `moma:conditionIn` | `xsd:string` | Condition assessment on return. |

### Acquisition

| Property | Range | Description |
|----------|-------|-------------|
| `moma:acquisitionId` | `xsd:integer` | Unique acquisition identifier. |
| `moma:acquiredDate` | `xsd:date` | Date the artwork entered the collection. |
| `moma:acquisitionMethod` | `xsd:string` | How the artwork was acquired: purchase, gift, bequest, transfer. |
| `moma:acquisitionSource` | `xsd:string` | Name of the donor, seller or transferring institution. |
| `moma:price` | `xsd:string` | Purchase price, if applicable. |
| `moma:fundingSource` | `xsd:string` | The fund or donor that covered the acquisition cost. |

### ProvenanceRecord

| Property | Range | Description |
|----------|-------|-------------|
| `moma:provenanceId` | `xsd:integer` | Unique provenance record identifier. |
| `moma:ownerName` | `xsd:string` | Name of the prior owner. |
| `moma:ownerAcquiredDate` | `xsd:date` | Date the prior owner acquired the artwork. |
| `moma:ownerSoldDate` | `xsd:date` | Date the prior owner sold or transferred the artwork. |
| `moma:ownerLocation` | `xsd:string` | Location of the prior owner. |
| `moma:provenanceNotes` | `xsd:string` | Free-text notes on this provenance link. |
| `moma:verified` | `xsd:boolean` | Whether the ownership record has been independently verified. |

### ConservationRecord

| Property | Range | Description |
|----------|-------|-------------|
| `moma:conservationId` | `xsd:integer` | Unique conservation record identifier. |
| `moma:examinationDate` | `xsd:date` | Date the artwork was examined. |
| `moma:conditionRating` | `xsd:string` | Overall condition assessment: Excellent, Good, Fair, Poor. |
| `moma:findings` | `xsd:string` | Description of findings from the examination. |
| `moma:treatment` | `xsd:string` | Treatment applied to the artwork. |
| `moma:materialsUsed` | `xsd:string` | Conservation materials used during treatment. |
| `moma:nextReview` | `xsd:date` | Scheduled date for the next conservation review. |

### Conservator

| Property | Range | Description |
|----------|-------|-------------|
| `moma:conservatorId` | `xsd:integer` | Unique conservator identifier. |
| `moma:conservatorName` | `xsd:string` | Full name of the conservator. |
| `moma:specialization` | `xsd:string` | Area of conservation expertise, e.g. Paintings, Works on Paper, Time-based Media. |
| `moma:conservatorDepartment` | `xsd:string` | Department the conservator belongs to. |
| `moma:email` | `xsd:string` | Conservator's email address. |

### MediaAsset

| Property | Range | Description |
|----------|-------|-------------|
| `moma:mediaId` | `xsd:integer` | Unique media asset identifier. |
| `moma:mediaUrl` | `xsd:anyURI` | URL of the media file. |
| `moma:mediaType` | `xsd:string` | Type of file: photograph, video, 3d-scan, audio. |
| `moma:caption` | `xsd:string` | Caption or description of the media asset. |
| `moma:isPrimary` | `xsd:boolean` | True if this is the default display image for the artwork. |
| `moma:mediaCreatedDate` | `xsd:date` | Date the media asset was created. |
