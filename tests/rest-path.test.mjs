import test from "node:test";
import assert from "node:assert/strict";
import { restStages, readRestRoute, restStageHash, resolveRestSelection, stageFromPartTitle } from "../assets/rest-path-models.mjs";

test("six connected stages retain an optional overview and a single teaching domain", () => {
  assert.deepEqual(restStages.map(stage => stage.id), [0, 1, 2, 3, 4, 5, 6]);
  for (const stage of restStages) {
    for (const key of ["title", "summary", "outcome", "story"]) assert.ok(stage[key]);
  }
  assert.match(restStages[3].story, /course catalogue/);
  assert.match(restStages[4].story, /Enroll/);
});
test("every mode and stage link round-trips, including the original markdown route", () => {
  for (const mode of ["guided", "reference"]) {
    for (let stage = 0; stage <= 6; stage++) {
      assert.deepEqual(readRestRoute(restStageHash(mode, stage)), { mode, stage, anchor: null, warning: "" });
    }
  }
  assert.equal(readRestRoute("#/docs/01-REST-APIS.md").stage, 1);
  assert.equal(readRestRoute("#/docs/02-GRAPHQL"), null);
});
test("existing heading links reveal their original stage; unknown anchors never hide the reference", () => {
  const anchorStages = new Map([["first-rest-api-design", 1], ["etag", 5]]);
  assert.equal(resolveRestSelection(readRestRoute("#/docs/01-REST-APIS?id=etag"), anchorStages).stage, 5);
  assert.equal(resolveRestSelection(readRestRoute("#/docs/01-REST-APIS?id=unknown"), anchorStages).mode, "reference");
  assert.equal(resolveRestSelection(readRestRoute("#/docs/01-REST-APIS?id=etag&view=reference"), anchorStages).mode, "reference");
});
test("invalid deep links are explicitly reported and leave all text accessible", () => {
  for (const hash of ["#/docs/01-REST-APIS?stage=9", "#/docs/01-REST-APIS?view=bad", "#/docs/01-REST-APIS?stage=01"]) {
    const result = readRestRoute(hash);
    assert.equal(result.mode, "reference");
    assert.ok(result.warning);
  }
  assert.throws(() => restStageHash("bad", 1), RangeError);
  assert.throws(() => restStageHash("guided", 7), RangeError);
});
test("source boundaries use only the original six Part headings", () => {
  assert.equal(stageFromPartTitle("Part 4: Idempotency & Distributed Systems"), 4);
  assert.equal(stageFromPartTitle("Chapter 1: Anatomy of an HTTP Request"), null);
  assert.equal(stageFromPartTitle("Part 1: Request Line"), 1);
  assert.equal(stageFromPartTitle("Part 7: New topics"), null);
});
