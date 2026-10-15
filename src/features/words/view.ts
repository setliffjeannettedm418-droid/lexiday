export interface WordListView {
  query: string;
  date: string;
  filter: string;
  sort: string;
  page: number;
}
export function readWordListView(params: URLSearchParams): WordListView {
  const page = Number(params.get("page") || 1);
  return {
    query: params.get("q") || "",
    date: params.get("date") || "all",
    filter: ["mastered", "0", "1", "2"].includes(params.get("filter") || "") ? params.get("filter")! : "all",
    sort: ["az", "wrong"].includes(params.get("sort") || "") ? params.get("sort")! : "default",
    page: Number.isSafeInteger(page) && page > 0 ? page - 1 : 0,
  };
}
export function wordListPath(mistakes: boolean, view: WordListView) {
  const params = new URLSearchParams();
  if (view.query) params.set("q", view.query);
  if (view.date !== "all") params.set("date", view.date);
  if (view.filter !== "all") params.set("filter", view.filter);
  if (view.sort !== "default") params.set("sort", view.sort);
  if (view.page > 0) params.set("page", String(view.page + 1));
  return (mistakes ? "/mistakes" : "/words") + (params.size ? "?" + params : "");
}
export function wordListReturn(params: URLSearchParams) {
  const [route, query = ""] = (params.get("from") || "").split("?");
  const scroll = Number(params.get("scroll"));
  if (route !== "/words" && route !== "/mistakes") return { path: "/words", scroll: 0, mistakes: false };
  return {
    path: wordListPath(route === "/mistakes", readWordListView(new URLSearchParams(query))),
    scroll: Number.isFinite(scroll) && scroll >= 0 ? scroll : 0,
    mistakes: route === "/mistakes",
  };
}
