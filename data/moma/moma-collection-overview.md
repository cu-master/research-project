# MoMA Collection — How We Think About Our Data

This document describes the key concepts the museum tracks and how they relate to one another. Think of it as a map of everything we know about our collection.

---

## The Core Concepts

**Artworks** are the heart of the collection. Each artwork has a unique registration code (its accession number) and carries information like its title, materials, dimensions, date of creation, and whether it's currently on public display. Every artwork belongs to a curatorial **Department** and has a **Location** — either a named gallery on a specific floor and wing, or a storage facility.

**Artists** are the people or groups credited with creating artworks. We record biographical details such as nationality, gender, birth and death years, and links to external reference databases like Wikidata and the Getty Union List of Artist Names.

Because some artworks have multiple creators, we use an **Artwork Credit** to link an artist to a specific work. Each credit captures the artist's role (for example: Artist, Architect, Designer, or Manufacturer) and the order in which they should be listed when several contributors are credited.

---

## Exhibitions

An **Exhibition** is a named show with an opening date, a closing date, a lead curator, and an organising department. When an exhibition travels, we also record the name of the host venue.

When a specific artwork appears in a specific exhibition, we capture that as an **Exhibition Presentation** — recording when the artwork went up, when it came down, and the wall-label text displayed beside it.

---

## Loans

A **Loan** tracks an artwork that has been sent to an external institution. We record who is borrowing it, the start and end dates, the declared insurance value, and the artwork's condition both when it left and when it returned. The loan status can be pending, active, returned, or cancelled.

---

## How Artworks Enter the Collection

An **Acquisition** is the event that officially brought an artwork into the MoMA collection. We note the date, how it was acquired (purchase, gift, bequest, or transfer), who the source was, the purchase price if applicable, and which fund or donor covered the cost.

---

## Ownership History

A **Provenance Record** documents one link in an artwork's chain of ownership before it came to MoMA — who owned it, when they acquired it, when they sold or transferred it, where they were based, and whether that ownership has been independently verified.

---

## Conservation

A **Conservation Record** is a formal report filed after an artwork is examined or treated. It captures the date of examination, an overall condition rating (Excellent, Good, Fair, or Poor), what the conservator found, what treatment was applied, and when the next review is scheduled.

**Conservators** are the museum staff members who carry out this work. Each conservator has a named area of expertise — for example, Paintings, Works on Paper, or Time-based Media.

---

## Digital Media

A **Media Asset** is any digital file associated with an artwork — a photograph, video, 3D scan, or audio recording. Each asset has a URL, a caption, a creation date, and a flag indicating whether it is the primary display image for that artwork.

---

## How Everything Connects

At the centre of the model sits the **Artwork** — everything else either describes it, tracks what happens to it, or links people and places to it.

- **Artist** → creates an Artwork (via an Artwork Credit specifying their role)
- **Artwork** → belongs to a Department and is held at a Location
- **Exhibition** → is organised by a Department and features Artworks (via Exhibition Presentations)
- **Loan** → covers an Artwork sent to an external institution
- **Acquisition** → is the event that brought an Artwork into the collection
- **Provenance Record** → validates the ownership history that supports an Acquisition
- **Conservation Record** → documents the examination or treatment of an Artwork, filed by a Conservator
- **Media Asset** → documents an Artwork through photographs, videos, or scans
