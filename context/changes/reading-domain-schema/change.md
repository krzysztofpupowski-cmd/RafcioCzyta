---
change_id: reading-domain-schema
title: Schemat domeny nauki czytania
status: impl_reviewed
created: 2026-05-26
updated: 2026-05-27
archived_at: null
---

## Notes

Roadmap **F-01** (`context/foundation/roadmap.md`). GitHub: [#5](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/5).

**Outcome:** (foundation) tabele i polityki RLS na poziom czytania, fiszki (szkic / zaakceptowane / odrzucone), sesje ćwiczeń i zapis postępu między sesjami.

**PRD refs:** Access Control, Business Logic, FR-002, FR-004, FR-006, FR-007

**Unlocks:** S-01, S-02, S-03, S-04, S-05 — reguła „tylko zaakceptowany materiał na poziomie dziecka trafia do ćwiczeń”.

**Risk:** Bez trwałego modelu każdy kolejny slice to mocki w pamięci — przy `time` to największy ukryty koszt.
