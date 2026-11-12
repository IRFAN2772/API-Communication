import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seniorCourse, seniorEnrollment, soapContract } from "../assets/senior-lesson-fixtures.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const lesson = read("docs/lessons/SOAP-XML-AND-ENTERPRISE-CONTRACTS.md");
const xsd = read("docs/contracts/course_api.xsd");
const wsdl = read("docs/contracts/course_api.wsdl");
const openapi = JSON.parse(read("docs/contracts/course_api.openapi.json"));
const original = read("docs/07-SENIOR-DESIGN-GUIDE.md");

function example(name) {
  const marker = `<!-- example: ${name} -->`;
  assert.equal(lesson.split(marker).length - 1, 1, name);
  const section = lesson.split(marker)[1];
  const block = section.match(/^\s*```xml\n([\s\S]*?)\n```/);
  assert.ok(block, name);
  return block[1];
}

// These inexpensive source checks are not a replacement for XML parsing or XSD validation.
test("the lesson follows the canonical post-enrollment read and JSON contract", () => {
  assert.deepEqual(seniorCourse, { id: "course-101", title: "API Fundamentals", seats: 29 });
  assert.deepEqual(seniorEnrollment, {
    id: "enrollment-42", courseId: "course-101", learnerId: "learner-7",
  });
  assert.deepEqual(openapi.components.schemas.Course.required, ["id", "title", "seats"]);
  const fields = openapi.components.schemas.Course.properties;
  assert.equal(fields.id.minLength, 1);
  assert.equal(fields.title.minLength, 1);
  assert.equal(fields.id.maxLength, undefined);
  assert.equal(fields.title.maxLength, undefined);
  assert.deepEqual(fields.seats, { type: "integer", minimum: 0, maximum: 2147483647 });
  assert.equal(openapi.components.parameters.CourseId.schema.maxLength, 128);
  assert.match(lesson, /read-only/);
  assert.match(lesson, /cannot\s+enroll anyone/);
  assert.match(lesson, /learner-7/);
  assert.match(lesson, /enrollment-42/);
  assert.match(lesson, /exactly \*\*one operation\*\*/);
});

test("fixture identities appear in the intended contract and examples", () => {
  for (const value of [soapContract.wsdlNamespace, soapContract.soapBindingNamespace, soapContract.applicationNamespace, soapContract.action, soapContract.endpoint]) {
    assert.ok(wsdl.includes(value), value);
  }
  assert.ok(xsd.includes(`targetNamespace="${soapContract.applicationNamespace}"`));
  assert.ok(wsdl.includes('schemaLocation="course_api.xsd"'));
  assert.equal((wsdl.match(/<wsdl:portType\b/g) ?? []).length, 1);
  const portType = wsdl.match(/<wsdl:portType\b[\s\S]*?<\/wsdl:portType>/)?.[0];
  assert.ok(portType);
  assert.equal((portType.match(/<wsdl:operation\b/g) ?? []).length, 1);
  assert.ok(portType.includes(`name="${soapContract.operation}"`));
  assert.match(wsdl, /style="document"/);
  assert.equal((wsdl.match(/use="literal"/g) ?? []).length, 3);
  assert.doesNotMatch(xsd, /<xs:(?:import|include|redefine)\b|<!DOCTYPE/i);
  assert.doesNotMatch(wsdl, /<!DOCTYPE/i);

  const request = example("soap-get-course-request");
  const response = example("soap-get-course-response");
  const fault = example("soap-not-found-fault");
  for (const xml of [request, response, fault]) {
    assert.ok(xml.includes(soapContract.envelopeNamespace));
    assert.ok(xml.includes(soapContract.applicationNamespace));
    assert.match(xml, /<env:Envelope\b/);
    assert.match(xml, /<env:Body>/);
    assert.doesNotMatch(xml, /<!DOCTYPE/i);
  }
  assert.ok(request.includes(`<c:courseId>${seniorCourse.id}</c:courseId>`));
  for (const [name, value] of Object.entries(seniorCourse)) {
    assert.ok(response.includes(`<c:${name}>${value}</c:${name}>`));
  }
  assert.match(fault, /<env:Value>env:Sender<\/env:Value>/);
  assert.match(fault, /<env:Text xml:lang="en">/);
  assert.match(fault, /<c:code>NOT_FOUND<\/c:code>/);
  assert.ok(lesson.includes(soapContract.action));
  assert.match(lesson, /application\/soap\+xml; charset=utf-8; action=/);
});

test("standalone coverage explains version, security and compatibility boundaries", () => {
  for (const phrase of [
    /WSDL 1\.1 does not\s+mean SOAP 1\.1/,
    /not required for every possible SOAP/,
    /SOAPAction/,
    /Client.*Server/s,
    /mustUnderstand/,
    /disable DTD processing and external entity resolution/,
    /not authenticated|not a substitute|authorization/i,
    /replay defense/,
    /no maximum\s+length declared/,
    /additional properties/,
    /HTTP 400/,
    /not necessarily HTTP\s+404/,
    /no running SOAP service/,
  ]) assert.match(lesson, phrase);
  for (const href of [
    "../GUIDED-SENIOR-DESIGN.md",
    "../07-SENIOR-DESIGN-GUIDE.md",
    "../COURSE-CONTENT-MAP.md",
    "../CONTENT-CORRECTIONS.md",
    "../../assets/senior-lesson-fixtures.mjs",
    "../contracts/course_api.xsd",
    "../contracts/course_api.wsdl",
    "../contracts/course_api.openapi.json",
    "REST-HTTP-CONTRACTS.md",
  ]) assert.ok(lesson.includes(`](${href})`), href);
  assert.match(original, /## 12\. SOAP and XML APIs/);
  assert.match(original, /## 15\. API Data Models and Contracts/);
});

test("prediction answers are closed native disclosures containing HTML paragraphs", () => {
  const answers = [...lesson.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)];
  assert.ok(answers.length >= 8);
  assert.equal((lesson.match(/<details\b/g) ?? []).length, answers.length);
  assert.equal((lesson.match(/<\/details>/g) ?? []).length, answers.length);
  for (const [, body] of answers) {
    assert.match(body, /^\s*<summary>(?:Predict|Check):[^<]+<\/summary>\s*<p>[^<]+<\/p>\s*$/);
    assert.doesNotMatch(body, /`|\*\*|\[[^\]]+\]\(/);
  }
  assert.doesNotMatch(lesson, /<details[^>]*\bopen\b|<script\b/i);
});
