# Library

**Reach it:** the "Library" tab (`/library`); a project's own shelf is `/projects/<id>/library`. A fresh stack has no documents, so `run.sh seed` publishes one ("Verify sample document" in project `hi2vi`) through `POST /api/documents` with a full-scope key it mints; it lands in the scratch `KB_ROOT`, never the checkout.

**Drive it:** seed, open the Library, open the document from its row.

```bash drive
"$RUN" signin
"$RUN" seed
playwright-cli -s=hi2vi-verify goto "$WEB/library"
"$RUN" expect "Library" "1 document" "Verify sample document"
playwright-cli -s=hi2vi-verify screenshot --filename="$EV/library.png"
playwright-cli -s=hi2vi-verify click 'role=link[name="Verify sample document"]'
"$RUN" expect "Seeded by the verify skill"
playwright-cli -s=hi2vi-verify screenshot --filename="$EV/library-document.png"
```

**Proof:** `/library` shows "1 document" and a row "Verify sample document" under `hi2vi`; clicking it opens `/documents/<id>?from=%2Flibrary` with the body text "Seeded by the verify skill". Seeding twice makes a second document (the count then reads 2).

Without seeding, the empty state reads "No books or documents yet."
