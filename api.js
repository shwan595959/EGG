"use strict";

window.FoodAPI = (() => {
  const CONFIG = {
    SUPABASE_URL: "https://ouputvkdkhwrfblcitkk.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_BRcgwKr--JnVWMEF0QTIIg_8cUILITc",
    FUNCTION_NAME: "food-admin",
  };

  function checkConfig() {
    if (
      CONFIG.SUPABASE_URL.includes("YOUR_PROJECT") ||
      CONFIG.SUPABASE_PUBLISHABLE_KEY === "YOUR_PUBLISHABLE_KEY"
    ) {
      throw new Error(
        "api.js에서 Supabase URL과 공개 키를 먼저 설정해 주세요."
      );
    }
  }

  function baseUrl() {
    return CONFIG.SUPABASE_URL.replace(/\/+$/, "");
  }

  async function parseResponse(response) {
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        data?.error ||
        data?.message ||
        `요청에 실패했습니다. (${response.status})`;

      const error = new Error(message);
      error.status = response.status;

      throw error;
    }

    return data;
  }

  async function listFoods() {
    checkConfig();

    const foods = [];
    let offset = 0;
    const limit = 1000;

    // Supabase의 기본 조회 개수 제한을 고려해 나누어 조회합니다.
    while (true) {
      const params = new URLSearchParams({
        select: "*",
        order: "name.asc,id.asc",
        limit: String(limit),
        offset: String(offset),
      });

      const response = await fetch(
        `${baseUrl()}/rest/v1/foods?${params}`,
        {
          headers: {
            apikey: CONFIG.SUPABASE_PUBLISHABLE_KEY,
          },
          cache: "no-store",
        }
      );

      const page = await parseResponse(response);

      if (!Array.isArray(page)) {
        throw new Error("음식 목록 응답 형식이 올바르지 않습니다.");
      }

      foods.push(...page);

      if (page.length === 0) break;

      // 서버의 실제 최대 반환 개수 설정이 더 작아도 계속 조회합니다.
      offset += page.length;
    }

    return foods;
  }

  async function adminRequest(body, token = "") {
    checkConfig();

    const headers = {
      "Content-Type": "application/json",
      apikey: CONFIG.SUPABASE_PUBLISHABLE_KEY,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(
      `${baseUrl()}/functions/v1/${CONFIG.FUNCTION_NAME}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        cache: "no-store",
      }
    );

    return parseResponse(response);
  }

  return {
    listFoods,

    login(password) {
      return adminRequest({
        action: "login",
        password,
      });
    },

    create(food, token) {
      return adminRequest({
        action: "create",
        food,
      }, token);
    },

    update(id, food, token) {
      return adminRequest({
        action: "update",
        id,
        food,
      }, token);
    },

    remove(id, token) {
      return adminRequest({
        action: "delete",
        id,
      }, token);
    },
  };
})();
