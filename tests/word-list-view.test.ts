import test from "node:test";
import assert from "node:assert/strict";
import { readWordListView, wordListPath, wordListReturn } from "../src/features/words/view";
test("word list return preserves filters and page with reserved search characters", () => {
  const view = { query:"学习 & C++?",date:"2026-10-14",filter:"1",sort:"az",page:7 };
  const path=wordListPath(false,view);
  assert.deepEqual(readWordListView(new URLSearchParams(path.split("?")[1])),view);
  assert.deepEqual(wordListReturn(new URLSearchParams({from:path,scroll:"1234.5"})),{path,scroll:1234.5,mistakes:false});
  assert.equal(wordListReturn(new URLSearchParams({from:wordListPath(true,view)})).mistakes,true);
});
test("invalid return targets and page parameters fall back to a local word list", () => {
  for(const page of ["0","-1","NaN","Infinity","2.2","9007199254740999"])
    assert.equal(readWordListView(new URLSearchParams({page})).page,0);
  for(const from of ["https://example.com","//example.com/words","/settings","/words/anything"])
    assert.deepEqual(wordListReturn(new URLSearchParams({from,scroll:"-1"})),{path:"/words",scroll:0,mistakes:false});
});
