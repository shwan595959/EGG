"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const tbody = $("foodTableBody");

  let token = "";
  let expiresAt = 0;
  let sessionTimer = null;
  let loading = false;

  function setStatus(message, isError = false) {
    $("adminStatus").textContent = message;
    $("adminStatus").classList.toggle("error", isError);
  }

  function updateSummary() {
    const rows = [...tbody.rows];
    const savedCount = rows.filter(
      (row) => row.dataset.id
    ).length;

    const newCount = rows.length - savedCount;
    const dirtyCount = rows.filter(
      (row) => row.classList.contains("dirty")
    ).length;

    $("tableSummary").textContent =
      `Saved: ${savedCount} | New: ${newCount} ` +
      `Unsaved: ${dirtyCount}`;
  }

  function hasUnsavedChanges() {
    return Boolean(tbody.querySelector(".dirty"));
  }

  function lockEditor(message = "Edit Access Expired.") {
    token = "";
    expiresAt = 0;

    clearInterval(sessionTimer);

        tbody.replaceChildren();

    // 관리자 잠금 또는 세션 만료 시 제안 내용 제거
    $("suggestionsTableBody").replaceChildren();

    $("suggestionsStatus").textContent = "";
    $("suggestionsStatus").classList.remove("error");

    $("suggestionsSummary").textContent = "";

    $("editorPanel").hidden = true;

    $("loginPanel").hidden = false;
    $("passwordInput").value = "";

    setStatus(message);
  }

  function requireSession() {
    if (!token || Date.now() >= expiresAt) {
      lockEditor(
        "Access Expired. Please retry."
      );

      return false;
    }

    return true;
  }

  function updateSessionInfo() {
    const remaining = Math.ceil(
      (expiresAt - Date.now()) / 1000
    );

    if (remaining <= 0) {
      lockEditor(
        "Access Expired. Unsaved items have not saved."
      );

      return;
    }

    const minutes = Math.floor(remaining / 60);
    const seconds = String(remaining % 60).padStart(2, "0");

    $("sessionInfo").textContent =
      `Access ${minutes}:${seconds} Remain`;
  }

  function setLoading(value) {
    loading = value;

    $("addButton").disabled = value;
    $("reloadButton").disabled = value;
    $("lockButton").disabled = value;
  }

  function parseList(value) {
    return [...new Set(
      value
        .split(/[,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )];
  }

  function createField(field, value, label, options = {}) {
    const cell = document.createElement("td");
    let control;

    if (field === "grade") {
      control = document.createElement("select");

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select";
      control.append(placeholder);

      for (const grade of ["위험", "경고", "주의", "안전"]) {
        const option = document.createElement("option");
        option.value = grade;
        option.textContent = grade;
        control.append(option);
      }
    } else if (field === "note") {
      control = document.createElement("textarea");
      control.rows = 2;
      control.maxLength = 2000;
    } else {
      control = document.createElement("input");
      control.type = "text";

      if (field === "name") {
        control.maxLength = 100;
      }
    }

    control.className = "cell-input";
    control.dataset.field = field;
    control.setAttribute("aria-label", label);
    control.value = value ?? "";

    if (options.placeholder) {
      control.placeholder = options.placeholder;
    }

    cell.append(control);
    return cell;
  }

  function createRow(food = {}) {
    const row = document.createElement("tr");
    row.dataset.id = food.id ?? "";

    if (!food.id) {
      row.classList.add("dirty");
    }

    const number = document.createElement("td");
    number.className = "row-number";

    row.append(
      number,

      createField(
        "name",
        food.name,
        "Name",
        { placeholder: "Name" }
      ),

      createField("grade", food.grade ?? "", "등급"),

      createField(
        "aliases",
        (food.aliases ?? []).join(", "),
        "Aliase, Delimiter Allowed.",
        { placeholder: "Aliases" }
      ),

      createField(
        "tags",
        (food.tags ?? []).join(", "),
        "Tags, Delimiter Allowed",
        { placeholder: "Tags" }
      ),

      createField(
        "note",
        food.note ?? "",
        "Note",
        { placeholder: "Desc" }
      )
    );

    const actionCell = document.createElement("td");
    const actionGroup = document.createElement("div");
    actionGroup.className = "row-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "row-button";
    saveButton.dataset.action = "save";
    saveButton.textContent = "Save";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "row-button delete";
    deleteButton.dataset.action = "delete";
    deleteButton.textContent = food.id ? "Delete" : "Cancel";

    actionGroup.append(saveButton, deleteButton);
    actionCell.append(actionGroup);
    row.append(actionCell);

    return row;
  }

  function renumberRows() {
    [...tbody.rows].forEach((row, index) => {
      row.querySelector(".row-number").textContent =
        String(index + 1);
    });

    updateSummary();
  }

  function readRow(row) {
    const value = (field) => {
      return row.querySelector(
        `[data-field="${field}"]`
      ).value;
    };

    const food = {
      name: value("name").trim(),
      grade: value("grade"),
      aliases: parseList(value("aliases")),
      tags: parseList(value("tags")),
      note: value("note"),
    };

    if (!food.name || food.name.length > 100) {
      throw new Error("Character limits 1~100");
    }

    if (!["위험", "경고", "주의", "안전"].includes(food.grade)) {
      throw new Error("Select rank");
    }

    for (const [label, items] of [
      ["별칭", food.aliases],
      ["태그", food.tags],
    ]) {
      if (
        items.length > 30 ||
        items.some((item) => item.length > 100)
      ) {
        throw new Error(
          `${label}는 30개 이하, 항목당 100자 이하로 입력하세요.`
        );
      }
    }

    if (food.note.length > 2000) {
      throw new Error("설명은 2000자 이하로 입력하세요.");
    }

    return food;
  }

  async function loadTable() {
    if (!requireSession() || loading) return;

    const currentToken = token;

    setLoading(true);
    setStatus("Loading Data");

    try {
      const foods = await FoodAPI.listFoods();

      // 조회 중 세션이 만료되었거나 잠겼다면 표시하지 않습니다.
      if (token !== currentToken || !requireSession()) return;

      const fragment = document.createDocumentFragment();

      for (const food of foods) {
        fragment.append(createRow(food));
      }

      tbody.replaceChildren(fragment);
      renumberRows();

      setStatus(`Completed: ${foods.length}`);
    } catch (error) {
      if (token === currentToken) {
        setStatus(error.message, true);
      }
    } finally {
      setLoading(false);
    }
  }

  function setRowBusy(row, busy) {
    row.dataset.busy = busy ? "true" : "false";

    row.querySelectorAll(
      "input, textarea, select, button"
    ).forEach((element) => {
      element.disabled = busy;
    });
  }

  async function saveRow(row) {
    if (
      !requireSession() ||
      row.dataset.busy === "true"
    ) {
      return;
    }

    let food;

    try {
      food = readRow(row);
    } catch (error) {
      setStatus(error.message, true);
      return;
    }

    const currentToken = token;
    const id = row.dataset.id;

    setRowBusy(row, true);
    setStatus("Saving");

    try {
      const result = id
        ? await FoodAPI.update(id, food, currentToken)
        : await FoodAPI.create(food, currentToken);

      if (token !== currentToken || !requireSession()) return;

      if (!result?.food?.id) {
        throw new Error("서버의 저장 응답을 확인할 수 없습니다.");
      }

      row.replaceWith(createRow(result.food));
      renumberRows();

      setStatus(`‘${result.food.name}’ Saved`);
    } catch (error) {
      if (token !== currentToken) return;

      if (error.status === 401) {
        lockEditor(
          "Access Expired. Please Retry."
        );
      } else {
        setStatus(error.message, true);
      }
    } finally {
      setRowBusy(row, false);
    }
  }

  async function deleteRow(row) {
    if (
      !requireSession() ||
      row.dataset.busy === "true"
    ) {
      return;
    }

    const id = row.dataset.id;

    if (!id) {
      row.remove();
      renumberRows();
      return;
    }

    const name = row.querySelector(
      '[data-field="name"]'
    ).value.trim();

    if (!confirm(`Confirm to remove : ‘${name || "Item"}’`)) {
      return;
    }

    const currentToken = token;

    setRowBusy(row, true);
    setStatus("Removing");

    try {
      await FoodAPI.remove(id, currentToken);

      if (token !== currentToken || !requireSession()) return;

      row.remove();
      renumberRows();

      setStatus("Removed");
    } catch (error) {
      if (token !== currentToken) return;

      if (error.status === 401) {
        lockEditor(
          "Access Expired. Please Retry."
        );
      } else {
        setStatus(error.message, true);
      }
    } finally {
      setRowBusy(row, false);
    }
  }

// ──────────────────────────────
// 편집 표 정렬
// ──────────────────────────────

const riskOrder = {
  위험: 4,
  경고: 3,
  주의: 2,
  안전: 1,
};

const nameSorter = new Intl.Collator("ko", {
  numeric: true,
  sensitivity: "base",
});

function sortTableRows() {
  if (!requireSession() || loading) return;

  // 저장·삭제 요청 중에는 행을 이동하지 않습니다.
  if (tbody.querySelector('tr[data-busy="true"]')) {
    setStatus(
      "Sort Error: Duty must be completed",
      true
    );

    return;
  }

  const sortType = $("tableSort").value;

  // DB에 저장된 값이 아닌 현재 입력된 값을 기준으로 정렬합니다.
  const rows = [...tbody.rows].map((row, index) => {
    const name = row.querySelector(
      '[data-field="name"]'
    ).value.trim();

    const grade = row.querySelector(
      '[data-field="grade"]'
    ).value;

    return {
      row,
      index,
      name,
      risk: riskOrder[grade] ?? null,
    };
  });

  rows.sort((a, b) => {
    if (sortType === "name-asc") {
      // 이름이 비어 있는 새 행은 아래로 보냅니다.
      if (!a.name && b.name) return 1;
      if (a.name && !b.name) return -1;

      return (
        nameSorter.compare(a.name, b.name) ||
        a.index - b.index
      );
    }

    // 등급이 선택되지 않은 행은 항상 맨 아래로 보냅니다.
    if (a.risk === null && b.risk !== null) return 1;
    if (a.risk !== null && b.risk === null) return -1;

    if (a.risk !== null && b.risk !== null) {
      const difference =
        sortType === "risk-asc"
          ? a.risk - b.risk
          : b.risk - a.risk;

      if (difference !== 0) return difference;
    }

    // 같은 등급은 이름순, 이름도 같으면 기존 순서를 유지합니다.
    return (
      nameSorter.compare(a.name, b.name) ||
      a.index - b.index
    );
  });

  // 기존 행을 이동하므로 입력 내용과 미저장 표시가 유지됩니다.
  const fragment = document.createDocumentFragment();

  for (const item of rows) {
    fragment.append(item.row);
  }

  tbody.append(fragment);
  renumberRows();

  const sortLabel =
    $("tableSort").selectedOptions[0].textContent;

  setStatus(
    `${sortLabel} Sorted.`
  );
}

$("applySortButton").addEventListener(
  "click",
  sortTableRows
);

  // ──────────────────────────────
  // 음식 제안 목록
  // ──────────────────────────────

  const suggestionsBody = $("suggestionsTableBody");

  let suggestionsLoading = false;
  let suggestionsDeleting = false;

  const suggestionDateFormatter = new Intl.DateTimeFormat(
    "ko-KR",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Seoul",
    }
  );

  function setSuggestionsStatus(message, isError = false) {
    const status = $("suggestionsStatus");

    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function updateSuggestionsControls() {
    $("reloadSuggestionsButton").disabled =
      suggestionsLoading || suggestionsDeleting;

    suggestionsBody.querySelectorAll(
      'button[data-action="complete-suggestion"]'
    ).forEach((button) => {
      button.disabled =
        suggestionsLoading || suggestionsDeleting;
    });
  }

  function updateSuggestionsSummary() {
    const count = suggestionsBody.querySelectorAll(
      "tr[data-suggestion-id]"
    ).length;

    $("suggestionsSummary").textContent =
      `Items: ${count}`;
  }

  function showSuggestionsEmpty() {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 4;
    cell.textContent = "No suggestions";

    row.append(cell);
    suggestionsBody.replaceChildren(row);
  }

  function createSuggestionRow(suggestion) {
    const row = document.createElement("tr");

    row.dataset.suggestionId = suggestion.id;
    row.dataset.suggestionName = suggestion.name ?? "";

    const nameCell = document.createElement("td");
    nameCell.textContent = suggestion.name ?? "";

    const noteCell = document.createElement("td");
    noteCell.textContent =
      suggestion.note?.trim() || "None";

    const dateCell = document.createElement("td");
    const date = new Date(suggestion.created_at);

    dateCell.textContent = Number.isNaN(date.getTime())
      ? "-"
      : suggestionDateFormatter.format(date);

    const actionCell = document.createElement("td");

    const completeButton = document.createElement("button");
    completeButton.type = "button";
    completeButton.className = "row-button";
    completeButton.dataset.action = "complete-suggestion";
    completeButton.textContent = "Duty Complete";

    completeButton.setAttribute(
      "aria-label",
      `${suggestion.name ?? "Item"} processed`
    );

    actionCell.append(completeButton);

    row.append(
      nameCell,
      noteCell,
      dateCell,
      actionCell
    );

    return row;
  }

  async function loadSuggestions() {
    if (
      !requireSession() ||
      suggestionsLoading ||
      suggestionsDeleting
    ) {
      return;
    }

    const currentToken = token;

    suggestionsLoading = true;
    updateSuggestionsControls();

    setSuggestionsStatus(
      "음식 제안을 불러오는 중입니다."
    );

    try {
      const result = await FoodAPI.listSuggestions(
        currentToken
      );

      // 이전 세션의 응답은 표시하지 않음
      if (
        token !== currentToken ||
        !requireSession()
      ) {
        return;
      }

      if (!Array.isArray(result?.suggestions)) {
        throw new Error(
          "Server Res. Undefined"
        );
      }

      const fragment = document.createDocumentFragment();

      for (const suggestion of result.suggestions) {
        fragment.append(
          createSuggestionRow(suggestion)
        );
      }

      suggestionsBody.replaceChildren(fragment);

      if (result.suggestions.length === 0) {
        showSuggestionsEmpty();
      }

      updateSuggestionsSummary();

      setSuggestionsStatus(
        "Data Loaded"
      );
    } catch (error) {
      if (token !== currentToken) return;

      if (error.status === 401) {
        lockEditor(
          "Expired Access"
        );
      } else {
        setSuggestionsStatus(error.message, true);
      }
    } finally {
      suggestionsLoading = false;
      updateSuggestionsControls();
    }
  }

  async function completeSuggestion(row) {
    if (
      !requireSession() ||
      suggestionsLoading ||
      suggestionsDeleting
    ) {
      return;
    }

    const id = row.dataset.suggestionId;
    const name = row.dataset.suggestionName;

    if (!id) return;

    const confirmed = confirm(
      `‘${name}’ Registered?\n\n` +
      "This item is permanently removed.\n" +
      "The registered data won't be removed."
    );

    if (!confirmed) return;

    const currentToken = token;
    const button = row.querySelector("button");

    suggestionsDeleting = true;
    updateSuggestionsControls();

    button.textContent = "Processing";

    setSuggestionsStatus(
      "Sug. Prcs."
    );

    try {
      const result = await FoodAPI.completeSuggestion(
        id,
        currentToken
      );

      if (
        token !== currentToken ||
        !requireSession()
      ) {
        return;
      }

      if (result?.success !== true) {
        throw new Error(
          "Result cannot be checked."
        );
      }

      // 서버에서 삭제한 뒤에만 화면에서도 제거
      row.remove();

      if (
        !suggestionsBody.querySelector(
          "tr[data-suggestion-id]"
        )
      ) {
        showSuggestionsEmpty();
      }

      updateSuggestionsSummary();

      setSuggestionsStatus(
        `‘${name}’  completely processed`
      );
    } catch (error) {
      if (token !== currentToken) return;

      if (error.status === 401) {
        lockEditor(
          "Expired access"
        );
      } else {
        setSuggestionsStatus(error.message, true);
      }
    } finally {
      suggestionsDeleting = false;
      button.textContent = "Complete";
      updateSuggestionsControls();
    }
  }

  $("reloadSuggestionsButton").addEventListener(
    "click",
    loadSuggestions
  );

  suggestionsBody.addEventListener("click", (event) => {
    const button = event.target.closest(
      'button[data-action="complete-suggestion"]'
    );

    if (!button) return;

    const row = button.closest(
      "tr[data-suggestion-id]"
    );

    if (row) {
      completeSuggestion(row);
    }
  });



  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const passwordInput = $("passwordInput");
    const password = passwordInput.value;

    if (!password) return;

    $("loginButton").disabled = true;
    setStatus("Checking Access Eligibility in progress");

    try {
      const result = await FoodAPI.login(password);

      if (
        typeof result?.token !== "string" ||
        !Number.isFinite(result.expiresIn) ||
        result.expiresIn <= 0
      ) {
        throw new Error("Login Request is invalid");
      }

      token = result.token;
      expiresAt = Date.now() + result.expiresIn * 1000;

      passwordInput.value = "";

      $("loginPanel").hidden = true;
      $("editorPanel").hidden = false;

      clearInterval(sessionTimer);
      updateSessionInfo();

      sessionTimer = setInterval(
        updateSessionInfo,
        1000
      );

      await loadTable();
      await loadSuggestions();
    } catch (error) {
      passwordInput.value = "";
      setStatus(error.message, true);
    } finally {
      $("loginButton").disabled = false;
    }
  });

  $("addButton").addEventListener("click", () => {
    if (!requireSession() || loading) return;

    const row = createRow();
    tbody.prepend(row);

    renumberRows();

    row.querySelector('[data-field="name"]').focus();

    setStatus(
      "Created a new Row"
    );
  });

  $("reloadButton").addEventListener("click", () => {
    if (
      hasUnsavedChanges() &&
      !confirm("Reload without unsaved items?")
    ) {
      return;
    }

    loadTable();
  });

  $("lockButton").addEventListener("click", () => {
    if (
      hasUnsavedChanges() &&
      !confirm("Lock without unsaved items?")
    ) {
      return;
    }

    lockEditor();
  });

  function markDirty(event) {
    const row = event.target.closest("tr");

    if (!row) return;

    row.classList.add("dirty");
    updateSummary();
  }

  tbody.addEventListener("input", markDirty);
  tbody.addEventListener("change", markDirty);

  tbody.addEventListener("click", (event) => {
    const button = event.target.closest(
      "button[data-action]"
    );

    if (!button) return;

    const row = button.closest("tr");

    if (button.dataset.action === "save") {
      saveRow(row);
    } else {
      deleteRow(row);
    }
  });

  window.addEventListener("beforeunload", (event) => {
    const busy = tbody.querySelector(
      'tr[data-busy="true"]'
    );

        if (
      hasUnsavedChanges() ||
      busy ||
      suggestionsDeleting
    ) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
})();
