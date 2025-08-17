// =========================================
// js/restore.js — restore & download backups UI helpers
// =========================================
(function () {
  function fmt(ts) {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return String(ts);
    }
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function loadBackupList(limit = 50) {
    const rows = await Backup.listBackups(limit);
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      count: (r.payload?.visitsCiphertexts || []).length,
      payload: r.payload,
      meta: r.meta,
    }));
  }

  async function renderBackupTable(containerId = "backupPanel") {
    const el = document.getElementById(containerId);
    if (!el) return;

    // Card shell + toolbar + table wrapper
    el.innerHTML = `
      <div class="backup-card" role="region" aria-label="Kopie zapasowe">
        <h3>💾 Kopie zapasowe (automatyczne przy logowaniu)</h3>
        <p class="muted" style="text-align:center;margin:0 0 8px;">
          Najnowsze na górze. Przywracanie <strong>zastąpi</strong> obecną zaszyfrowaną bazę.
        </p>

        <div class="backup-toolbar" aria-label="Akcje kopii zapasowych">
          <button id="refreshBackups" type="button" class="primary" title="Odśwież listę">
            <i class="fa-solid fa-rotate"></i> Odśwież
          </button>

          <button id="exportCurrent" type="button" class="primary"
                  title="Pobierz aktualną zawartość localStorage[visits] jako JSON">
            <i class="fa-solid fa-download"></i> Pobierz obecną bazę
          </button>

          <label class="primary" style="display:inline-flex;align-items:center;gap:.5rem;cursor:pointer;">
            <input id="importFile" type="file" accept="application/json" style="display:none;" />
            <i class="fa-solid fa-file-import" aria-hidden="true"></i>
            <span>Przywróć z pliku…</span>
          </label>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th style="text-align:right;">Pozycje</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody id="backupRows">
              <tr><td colspan="3" class="muted" style="padding:.85rem 1rem;">Ładowanie…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    const rowsEl = document.getElementById("backupRows");

    async function fill() {
      const list = await loadBackupList(100);
      if (!list.length) {
        rowsEl.innerHTML = `<tr><td colspan="3" class="muted" style="padding:.85rem 1rem;">
          Brak kopii zapasowych. Zaloguj się, aby utworzyć pierwszy zrzut.
        </td></tr>`;
        return;
      }

      rowsEl.innerHTML = list.map((r) => {
        const date = fmt(r.createdAt);
        const count = r.count;
        return `
          <tr>
            <td>${date}</td>
            <td style="text-align:right;">${count}</td>
            <td>
              <div class="row-actions">
                <button class="icon-btn" data-action="download" data-id="${r.id}" type="button"
                        title="Pobierz kopię jako plik JSON">
                  <i class="fa-solid fa-file-arrow-down"></i> Pobierz
                </button>
                <button class="icon-btn danger" data-action="restore" data-id="${r.id}" type="button"
                        title="Przywróć tę kopię (zastąpi obecną bazę)">
                  <i class="fa-solid fa-rotate-left"></i> Przywróć
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }

    // Toolbar: Odśwież
    el.querySelector("#refreshBackups").addEventListener("click", fill);

    // Toolbar: Eksport bieżącej bazy
    el.querySelector("#exportCurrent").addEventListener("click", () => {
      const visitsRaw = localStorage.getItem("visits");
      const visits = (() => {
        try { return JSON.parse(visitsRaw || "[]"); } catch { return []; }
      })();
      const out = {
        createdAt: Date.now(),
        meta: { type: "manual-export", app: "bookCrypt", version: 1 },
        payload: { visitsCiphertexts: Array.isArray(visits) ? visits : [] },
      };
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      downloadJson(out, `bookCrypt-obecna-baza-${ts}.json`);
    });

    // Toolbar: Import / przywracanie z pliku
    el.querySelector("#importFile").addEventListener("change", async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const payload = data?.payload?.visitsCiphertexts;
        if (!Array.isArray(payload)) throw new Error("Nieprawidłowy format pliku kopii.");

        const ok = confirm(
          `Przywrócić z pliku „${file.name}”?` +
          `\nTo zastąpi obecną bazę (${payload.length} wpis(y)).`
        );
        if (!ok) return;

        localStorage.setItem("visits", JSON.stringify(payload));
        alert("Przywrócono kopię z pliku. Trwa przeładowanie…");
        location.reload();
      } catch (e) {
        alert("Nie udało się przywrócić z pliku: " + (e?.message || e));
        console.error(e);
      } finally {
        ev.target.value = "";
      }
    });

    // Akcje wierszy tabeli
    el.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const id = Number(btn.getAttribute("data-id"));
      if (!action || !id) return;

      // Pobierz wskazaną kopię (z listy)
      const list = await Backup.listBackups(200);
      const item = list.find((x) => x.id === id);
      if (!item) return alert("Nie znaleziono kopii.");

      if (action === "download") {
        const ts = new Date(item.createdAt).toISOString().replace(/[:.]/g, "-");
        downloadJson(item, `bookCrypt-kopia-${ts}.json`);
      }

      if (action === "restore") {
        const count = (item.payload?.visitsCiphertexts || []).length;
        const ok = confirm(
          `Przywrócić kopię z ${fmt(item.createdAt)}?` +
          `\nZastąpi to obecną bazę (${count} wpis(y)).`
        );
        if (!ok) return;

        const payload = item.payload?.visitsCiphertexts || [];
        localStorage.setItem("visits", JSON.stringify(payload));

        alert("Przywrócono kopię. Trwa przeładowanie…");
        location.reload();
      }
    });

    // Initial fill
    fill().catch((err) => {
      rowsEl.innerHTML = `<tr><td colspan="3" style="padding:.85rem 1rem;color:#b64949;">
        Nie udało się wczytać kopii: ${err?.message || err}
      </td></tr>`;
      console.error(err);
    });
  }

  window.RestoreUI = { renderBackupTable };
})();
