"use strict";

(() => {
  const $ = (id) => document.getElementById(id);

  const form = $("searchForm");
  const input = $("searchInput");

  let foods = [];
  let loaded = false;
  let lastQuery = "";

  const gradeClasses = {
    위험: "grade-danger",
    경고: "grade-warning",
    주의: "grade-caution",
    안전: "grade-safe",
  };

const gradeDescriptions = {
  위험: "먹지 못하거나 먹으면 치명적인 피해를 입어요.",
  경고: "높은 확률로 먹지 못하거나 심한 피해를 입어요.",
  주의: "조건이나 섭취량에 따라 주의가 필요한 항목이에요.",
  안전: "귀납적으로 이 항목은 안전해요.",
};


  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR")
      .replace(/\s+/g, "");
  }

  function getScore(food, query) {
    const name = normalize(food.name);
    const aliases = (food.aliases ?? []).map(normalize);
    const tags = (food.tags ?? []).map(normalize);

    if (name === query) return 1000;
    if (aliases.includes(query)) return 900;
    if (name.startsWith(query)) return 800;
    if (name.includes(query)) return 700;

    if (aliases.some((alias) => alias.startsWith(query))) {
      return 600;
    }

    if (aliases.some((alias) => alias.includes(query))) {
      return 500;
    }

    if (tags.includes(query)) return 400;

    if (tags.some((tag) => tag.includes(query))) {
      return 300;
    }

    return 0;
  }

  function sharedScore(food, best) {
    const bestTags = new Set(
      (best.tags ?? []).map(normalize).filter(Boolean)
    );

    return (food.tags ?? []).reduce((score, tag) => {
      return score + (bestTags.has(normalize(tag)) ? 1 : 0);
    }, 0);
  }

  function rankFoods(query) {
    return foods
      .map((food) => ({
        food,
        score: getScore(food, query),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        return (
          b.score - a.score ||
          a.food.name.localeCompare(b.food.name, "ko")
        );
      });
  }

  function renderTags(food) {
    const container = $("resultTags");
    container.replaceChildren();

    const values = [...new Set([
      ...(food.aliases ?? []),
      ...(food.tags ?? []),
    ])];

    for (const value of values.slice(0, 12)) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = value;
      container.append(tag);
    }
  }

  function renderRelated(matched, best) {
  const related = [];
  const used = new Set([best.id]);

  function add(food) {
    if (used.has(food.id)) return;

    used.add(food.id);
    related.push(food);
  }

  // 현재 검색어와 직접 관련 있는 음식 우선
  for (const item of matched.slice(1)) {
    add(item.food);
  }

  // 공통 태그가 있는 음식 추가
  const sameTags = foods
    .filter((food) => !used.has(food.id))
    .map((food) => ({
      food,
      score: sharedScore(food, best),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      return (
        b.score - a.score ||
        a.food.name.localeCompare(b.food.name, "ko")
      );
    });

  for (const item of sameTags) {
    add(item.food);
  }

  const container = $("relatedList");
  container.replaceChildren();
  container.setAttribute("role", "list");

  for (const food of related.slice(0, 8)) {
    const item = document.createElement("div");
    item.className = "related-item";
    item.setAttribute("role", "listitem");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "related-button";
    button.setAttribute(
      "aria-label",
      `${food.name}, ${food.grade} 등급 검색`
    );

    const name = document.createElement("span");
    name.className = "related-name";
    name.textContent = food.name;

    const meta = document.createElement("span");
    meta.className = "related-meta";

    const grade = document.createElement("span");
    grade.className =
      `related-grade ${gradeClasses[food.grade] ?? ""}`;
    grade.textContent = food.grade;

    const arrow = document.createElement("span");
    arrow.className = "related-arrow";
    arrow.textContent = "↗";
    arrow.setAttribute("aria-hidden", "true");

    meta.append(grade, arrow);
    button.append(name, meta);
    item.append(button);
    container.append(item);

    button.addEventListener("click", () => {
      input.value = food.name;
      search(food.name);

      // 선택한 음식의 큰 검색 결과로 이동
      $("bestResult").scrollIntoView({
        behavior: window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches ? "instant" : "smooth",
        block: "nearest",
      });
    });
  }

  $("relatedSection").hidden = related.length === 0;
}


  function search(rawQuery) {
    const query = normalize(rawQuery);

    if (!query || !loaded) return;

    lastQuery = rawQuery.trim();

    const matched = rankFoods(query);

    $("results").hidden = false;
    $("bestResult").hidden = matched.length === 0;
    $("emptyResult").hidden = matched.length > 0;
    $("relatedSection").hidden = true;

    $("resultCount").textContent =
      matched.length > 0
        ? `${matched.length}개의 검색 결과`
        : "No Result";

    if (matched.length === 0) {
  const nameField = $("suggestionName");
  const noteField = $("suggestionNote");
  const status = $("suggestionStatus");

  // 새로운 검색어일 때만 제안 입력란 초기화
  if (nameField.dataset.query !== lastQuery) {
    nameField.value = lastQuery;
    nameField.dataset.query = lastQuery;

    noteField.value = "";
    status.textContent = "";
    status.classList.remove("error");
  }

  return;
}
    const best = matched[0].food;

    $("resultName").textContent = best.name;
    $("resultNote").textContent =
      best.note?.trim() || "Nothing!";

    const badge = $("resultGrade");
    badge.textContent = best.grade;
    badge.className =
      `grade-badge ${gradeClasses[best.grade] ?? ""}`;

$("resultGradeDescription").textContent =
  gradeDescriptions[best.grade] ??
  "???";

    renderTags(best);
    renderRelated(matched, best);
  }

  async function loadFoods() {
    $("refreshButton").disabled = true;
    $("searchButton").disabled = true;
    $("connectionStatus").textContent =
      "Loading Data";

    try {
      const nextFoods = await FoodAPI.listFoods();

      foods = nextFoods;
      loaded = true;

      $("connectionStatus").textContent =
        `Database loaded: ${foods.length}`;

      if (lastQuery) {
        search(lastQuery);
      }
    } catch (error) {
      $("connectionStatus").textContent = error.message;
    } finally {
      $("refreshButton").disabled = false;
      $("searchButton").disabled = !loaded;
    }
  }


const suggestionPanel = $("suggestionPanel");
const suggestionList = $("searchSuggestions");

let suggestions = [];
let activeSuggestion = -1;
let suggestionTimer = null;
let isComposing = false;

function closeSuggestions() {
  clearTimeout(suggestionTimer);

  suggestionPanel.hidden = true;

  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");

  activeSuggestion = -1;
}

function selectSuggestion(index) {
  const options = [
    ...suggestionList.querySelectorAll(
      ".suggestion-option"
    ),
  ];

  activeSuggestion = index;

  options.forEach((option, optionIndex) => {
    option.setAttribute(
      "aria-selected",
      String(optionIndex === index)
    );
  });

  const selected = options[index];

  if (selected) {
    input.setAttribute(
      "aria-activedescendant",
      selected.id
    );

    selected.scrollIntoView({
      block: "nearest",
    });
  } else {
    input.removeAttribute("aria-activedescendant");
  }
}

function openFood(food) {
  input.value = food.name;

  closeSuggestions();
  search(food.name);

  input.focus();
}

function updateSuggestions() {
  clearTimeout(suggestionTimer);

  const query = normalize(input.value);

  if (!loaded || !query || isComposing) {
    closeSuggestions();
    return;
  }

  suggestions = rankFoods(query)
    .slice(0, 6)
    .map((item) => item.food);

  suggestionList.replaceChildren();
  activeSuggestion = -1;

  input.removeAttribute("aria-activedescendant");

  if (suggestions.length === 0) {
    closeSuggestions();
    return;
  }

  suggestions.forEach((food, index) => {
    const option = document.createElement("div");

    option.id = `food-suggestion-${index}`;
    option.className = "suggestion-option";

    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");

    const name = document.createElement("span");
    name.className = "suggestion-name";
    name.textContent = food.name;

    const grade = document.createElement("span");
    grade.className =
      `suggestion-grade ${gradeClasses[food.grade] ?? ""}`;
    grade.textContent = food.grade;

    option.append(name, grade);

    option.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    option.addEventListener("click", () => {
      openFood(food);
    });

    suggestionList.append(option);
  });

  suggestionPanel.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function scheduleSuggestions() {
  // 이전 검색어의 목록을 먼저 닫아 잘못 선택되는 것을 방지
  closeSuggestions();

  if (isComposing || !normalize(input.value)) {
    return;
  }

  suggestionTimer = setTimeout(
    updateSuggestions,
    100
  );
}

input.addEventListener("input", scheduleSuggestions);

// 한글 조합 중 Enter가 검색으로 처리되지 않도록 구분
input.addEventListener("compositionstart", () => {
  isComposing = true;
  closeSuggestions();
});

input.addEventListener("compositionend", () => {
  isComposing = false;
  scheduleSuggestions();
});

// 입력창을 다시 클릭하면 현재 검색어의 추천 목록 표시
input.addEventListener("focus", () => {
  if (!isComposing) {
    updateSuggestions();
  }
});

input.addEventListener("keydown", (event) => {
  if (
    event.isComposing ||
    isComposing ||
    event.keyCode === 229
  ) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeSuggestions();
    return;
  }

  if (
    event.key === "ArrowDown" ||
    event.key === "ArrowUp"
  ) {
    event.preventDefault();

    if (suggestionPanel.hidden) {
      updateSuggestions();
    }

    if (suggestionPanel.hidden || !suggestions.length) {
      return;
    }

    const nextIndex =
      event.key === "ArrowDown"
        ? (activeSuggestion + 1) % suggestions.length
        : activeSuggestion <= 0
          ? suggestions.length - 1
          : activeSuggestion - 1;

    selectSuggestion(nextIndex);
    return;
  }

  if (
    event.key === "Enter" &&
    !suggestionPanel.hidden &&
    activeSuggestion >= 0
  ) {
    event.preventDefault();

    openFood(suggestions[activeSuggestion]);
  }
});

// 검색창 밖을 누르면 추천 목록 닫기
document.addEventListener("pointerdown", (event) => {
  if (!form.contains(event.target)) {
    closeSuggestions();
  }
});

// Tab으로 검색창 밖으로 이동해도 닫기
form.addEventListener("focusout", (event) => {
  if (!form.contains(event.relatedTarget)) {
    closeSuggestions();
  }
});

// Enter 또는 검색 버튼
form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (isComposing) return;

  closeSuggestions();
  search(input.value);
});

$("refreshButton").addEventListener("click", () => {
  closeSuggestions();
  loadFoods();
});

loadFoods();

// ──────────────────────────────
// 음식 제안 제출
// ──────────────────────────────

let suggestionSubmitting = false;

$("foodSuggestionForm").addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    if (suggestionSubmitting) return;

    const nameField = $("suggestionName");
    const noteField = $("suggestionNote");
    const button = $("suggestionSubmitButton");
    const status = $("suggestionStatus");

    const name = nameField.value.trim();
    const note = noteField.value.trim();

    status.classList.remove("error");

    if (!name || name.length > 100) {
      status.textContent =
        "음식 이름을 1~100자로 입력해 주세요.";

      status.classList.add("error");
      nameField.focus();
      return;
    }

    if (note.length > 1000) {
      status.textContent =
        "추가 설명은 1000자 이하로 입력해 주세요.";

      status.classList.add("error");
      noteField.focus();
      return;
    }

    suggestionSubmitting = true;

    button.disabled = true;
    nameField.disabled = true;
    noteField.disabled = true;

    button.textContent = "보내는 중…";
    status.textContent = "";

    try {
      await FoodAPI.suggestFood(name, note);

      status.textContent =
        `‘${name}’ 제안을 보냈습니다. 검토 후 등록할게요.`;

      // 제출 중 다른 검색을 했으면 새 입력 내용은 유지
      if (
        nameField.value.trim() === name &&
        noteField.value.trim() === note
      ) {
        noteField.value = "";
      }
    } catch (error) {
      status.textContent =
        "제안을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";

      status.classList.add("error");
    } finally {
      suggestionSubmitting = false;

      button.disabled = false;
      nameField.disabled = false;
      noteField.disabled = false;

      button.textContent = "Submit";
    }
  }
);


})();
