# Decisions

- Page: new dedicated product page (NOT extending `views/OtaPlatform.tsx`).
- Publish: save triggers immediate publish to Fliggy.
- Import: Atour search/select import in v1.
- shid/srid: maintained via backend mapping tables, auto-filled at publish time.
- Tests: add minimal backend API tests; never call real TOP in tests.
