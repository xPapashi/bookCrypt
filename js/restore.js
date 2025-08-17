// =========================================
// js/restore.js — mobile-first backups UI (collapsible + batching)
// =========================================
(function () {
  const BATCH_SIZE = 12;   // how many items to render per “page”
  let allItems = [];
  let shown = 0;
  let expanded = false;

  function fmt(ts) {
    try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function loadBackupList(limit = 200) {
    const rows = await Backup.listBackups(limit);
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      count: (r.payload?.visitsCiphertexts || []).length,
      payload: r.payload,
      meta: r.meta,
    }));
  }

  function itemCard(r) {
    const date = fmt(r.createdAt);
    const count = r.count;
    return `
      <div class="backup-item" data-id="${r.id}">
        <div class="check">
          <input type="checkbox" data-id="${r.id}" aria-label="Zaznacz kopię ${date}" />
        </div>
        <div class="meta">
          <div class="date">${date}</div>
          <div class="pill">${count} pozycji</div>
        </div>
        <div class="actions">
          <button class="icon-btn" data-action="download" data-id="${r.id}" type="button"
                  title="Pobierz kopię jako plik JSON">
            <i class="fa-solid fa-file-arrow-down"></i> Pobierz
          </button>
          <button class="icon-btn" data-action="restore" data-id="${r.id}" type="button"
                  title="Przywróć tę kopię (zastąpi obecną bazę)">
            <i class="fa-solid fa-rotate-left"></i> Przywróć
          </button>
          <button class="icon-btn danger" data-action="delete" data-id="${r.id}" type="button"
                  title="Usuń tę kopię">
            <i class="fa-solid fa-trash"></i> Usuń
          </button>
        </div>
      </div>
    `;
  }

  function updateMoreBar(moreBtn) {
    if (!allItems.length) {
      moreBtn.style.display = "none";
      return;
    }
    const hasMore = shown < allItems.length;
    if (expanded) {
      moreBtn.innerHTML = `<i class="fa-solid fa-chevron-up"></i> Zwiń`;
      moreBtn.style.display = "inline-flex";
    } else if (hasMore) {
      const remaining = allItems.length - shown;
      moreBtn.innerHTML = `<i class="fa-solid fa-chevron-down"></i> Pokaż więcej (${remaining})`;
      moreBtn.style.display = "inline-flex";
    } else {
      // nothing more to show, but keep the “Zwiń” option hidden until expanded
      moreBtn.style.display = "none";
    }
  }

  function renderSlice(listEl, fadeEl, moreBtn) {
    const slice = allItems.slice(0, shown);
    listEl.innerHTML = slice.map(itemCard).join("");
    // collapsed state shows fade overlay
    if (expanded) {
      listEl.parentElement.classList.add("expanded");
    } else {
      listEl.parentElement.classList.remove("expanded");
    }
    fadeEl.style.display = expanded ? "none" : "block";
    updateMoreBar(moreBtn);
  }

  async function renderBackupTable(containerId = "backupPanel") {
    const el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML = `
      <div class="backup-card" role="region" aria-label="Kopie zapasowe">
        <h3>💾 Kopie zapasowe (automatyczne przy logowaniu)</h3>
        <p class="muted" style="text-align:center;margin:0 0 8px;">
          Najnowsze na górze. Przywracanie <strong>zastąpi</strong> obecną zaszyfrowaną bazę.
        </p>

        <div class="backup-toolbar" aria-label="Akcje kopii zapasowych">
          <button id="refreshBackups" type="button" class="primary">
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

        <div class="backup-toolbar" style="margin-top:-.25rem">
          <button id="toggleSelectAll" type="button" class="icon-btn" title="Zaznacz/odznacz wszystkie">
            <i class="fa-regular fa-square-check"></i> Zaznacz wszystko
          </button>
          <button id="deleteSelected" type="button" class="icon-btn danger" title="Usuń zaznaczone">
            <i class="fa-solid fa-trash"></i> Usuń zaznaczone
          </button>
        </div>

        <!-- Collapsible wrapper -->
        <div class="collapsible">
          <div id="backupList" class="backup-list" aria-live="polite" aria-busy="true">
            <div class="backup-item">
              <div class="check"></div>
              <div class="meta"><span class="muted">Ładowanie…</span></div>
            </div>
          </div>
          <div class="fade-out" aria-hidden="true"></div>
        </div>

        <div class="more-bar">
          <button id="moreBtn" type="button" class="more-btn">
            <i class="fa-solid fa-chevron-down"></i> Pokaż więcej
          </button>
        </div>
      </div>
    `;

    const listEl = document.getElementById("backupList");
    const fadeEl = el.querySelector(".fade-out");
    const moreBtn = document.getElementById("moreBtn");
    const selectAllBtn = document.getElementById("toggleSelectAll");
    const deleteSelectedBtn = document.getElementById("deleteSelected");

    // Data fill
    async function fill(resetExpanded = true) {
      listEl.setAttribute("aria-busy", "true");
      allItems = await loadBackupList(500); // fetch more, render in batches
      shown = Math.min(BATCH_SIZE, allItems.length);
      if (resetExpanded) expanded = false;

      if (!allItems.length) {
        listEl.innerHTML = `
          <div class="backup-item">
            <div class="check"></div>
            <div class="meta"><span class="muted">Brak kopii zapasowych. Zaloguj się, aby utworzyć pierwszy zrzut.</span></div>
            <div class="actions"></div>
          </div>`;
        fadeEl.style.display = "none";
        moreBtn.style.display = "none";
        listEl.setAttribute("aria-busy", "false");
        return;
      }

      renderSlice(listEl, fadeEl, moreBtn);
      listEl.setAttribute("aria-busy", "false");
    }

    // “Pokaż więcej / Zwiń”
    moreBtn.addEventListener("click", () => {
      if (!expanded) {
        // If collapsed: first show more in increments, then expand fully
        if (shown < allItems.length) {
          shown = Math.min(shown + BATCH_SIZE, allItems.length);
          renderSlice(listEl, fadeEl, moreBtn);
          // If we just reached full list, switch to expanded mode toggle
          if (shown >= allItems.length) {
            expanded = true;
            renderSlice(listEl, fadeEl, moreBtn);
          }
        } else {
          expanded = true;
          renderSlice(listEl, fadeEl, moreBtn);
        }
      } else {
        // Collapse back to initial slice
        expanded = false;
        shown = Math.min(BATCH_SIZE, allItems.length);
        renderSlice(listEl, fadeEl, moreBtn);
        // Scroll the list top back into view a bit (mobile nicety)
        listEl.closest(".backup-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });

    // Toolbar actions
    document.getElementById("refreshBackups").addEventListener("click", () => fill(false));

    document.getElementById("exportCurrent").addEventListener("click", () => {
      const visitsRaw = localStorage.getItem("visits");
      const visits = (() => { try { return JSON.parse(visitsRaw || "[]"); } catch { return []; } })();
      const out = {
        createdAt: Date.now(),
        meta: { type: "manual-export", app: "bookCrypt", version: 1 },
        payload: { visitsCiphertexts: Array.isArray(visits) ? visits : [] },
      };
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      downloadJson(out, `bookCrypt-obecna-baza-${ts}.json`);
    });

    document.getElementById("importFile").addEventListener("change", async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const payload = data?.payload?.visitsCiphertexts;
        if (!Array.isArray(payload)) throw new Error("Nieprawidłowy format pliku kopii.");

        const ok = confirm(`Przywrócić z pliku „${file.name}”?`
          + `\nTo zastąpi obecną bazę (${payload.length} wpis(y)).`);
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

    // Select all / none
    selectAllBtn.addEventListener("click", () => {
      const boxes = listEl.querySelectorAll('input[type="checkbox"][data-id]');
      const anyUnchecked = Array.from(boxes).some((b) => !b.checked);
      boxes.forEach((b) => { b.checked = anyUnchecked; });
      selectAllBtn.innerHTML = anyUnchecked
        ? `<i class="fa-regular fa-square-check"></i> Odznacz wszystko`
        : `<i class="fa-regular fa-square-check"></i> Zaznacz wszystko`;
    });

    // Bulk delete
    deleteSelectedBtn.addEventListener("click", async () => {
      const ids = Array.from(listEl.querySelectorAll('input[type="checkbox"][data-id]:checked'))
        .map((cb) => Number(cb.getAttribute('data-id')));
      if (!ids.length) return alert("Nie wybrano żadnych kopii do usunięcia.");
      const ok = confirm(`Usunąć zaznaczone kopie (${ids.length})? Operacja jest nieodwracalna.`);
      if (!ok) return;

      try {
        await Backup.deleteBackups(ids);
        await fill(); // re-fetch + reset collapsed state
        alert("Usunięto zaznaczone kopie.");
      } catch (e) {
        alert("Nie udało się usunąć: " + (e?.message || e));
        console.error(e);
      }
    });

    // Row actions (download / restore / delete single)
    el.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const id = Number(btn.getAttribute("data-id"));
      if (!action || !id) return;

      if (action === "download" || action === "restore") {
        const list = await Backup.listBackups(200);
        const item = list.find((x) => x.id === id);
        if (!item) return alert("Nie znaleziono kopii.");

        if (action === "download") {
          const ts = new Date(item.createdAt).toISOString().replace(/[:.]/g, "-");
          downloadJson(item, `bookCrypt-kopia-${ts}.json`);
          return;
        }

        if (action === "restore") {
          const count = (item.payload?.visitsCiphertexts || []).length;
          const ok = confirm(
            `Przywrócić kopię z ${fmt(item.createdAt)}?`
            + `\nZastąpi to obecną bazę (${count} wpis(y)).`
          );
          if (!ok) return;
          const payload = item.payload?.visitsCiphertexts || [];
          localStorage.setItem("visits", JSON.stringify(payload));
          alert("Przywrócono kopię. Trwa przeładowanie…");
          location.reload();
          return;
        }
      }

      // Single delete
      if (action === "delete") {
        const ok = confirm("Usunąć tę kopię? Operacja jest nieodwracalna.");
        if (!ok) return;
        try {
          await Backup.deleteBackup(id);
          // Remove from local array + re-render slice
          allItems = allItems.filter((x) => x.id !== id);
          shown = Math.min(shown, allItems.length);
          renderSlice(listEl, fadeEl, moreBtn);
          if (!allItems.length) {
            await fill(); // show empty state
          }
        } catch (e) {
          alert("Nie udało się usunąć kopii: " + (e?.message || e));
          console.error(e);
        }
      }
    });

    // Initial render
    fill().catch((err) => {
      listEl.innerHTML = `
        <div class="backup-item">
          <div class="check"></div>
          <div class="meta" style="color:#b64949;">Nie udało się wczytać kopii: ${err?.message || err}</div>
          <div class="actions"></div>
        </div>`;
      console.error(err);
    });
  }

  window.RestoreUI = { renderBackupTable };
})();
