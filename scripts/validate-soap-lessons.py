import copy
import json
import re
import subprocess
import sys
from pathlib import Path

if len(sys.argv) > 1:
    sys.path.insert(0, sys.argv[1])

from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
CONTRACTS = ROOT / "docs/contracts"
XML_SCHEMA_NS = "http://www.w3.org/2001/XMLSchema"
XML_NS = "http://www.w3.org/XML/1998/namespace"
fixtures = json.loads(subprocess.check_output(
    [
        "node", "--input-type=module", "-e",
        'import{seniorCourse,soapContract}from"./assets/senior-lesson-fixtures.mjs";'
        'console.log(JSON.stringify({course:seniorCourse,contract:soapContract}));',
    ],
    cwd=ROOT,
    text=True,
))
course = fixtures["course"]
contract = fixtures["contract"]
ENV = contract["envelopeNamespace"]
APP = contract["applicationNamespace"]
WSDL = contract["wsdlNamespace"]
SOAP_BINDING = contract["soapBindingNamespace"]


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def parse_xml(data, base_url=None):
    parser = etree.XMLParser(load_dtd=False, resolve_entities=False, no_network=True,
                             remove_comments=True, remove_pis=True)
    root = etree.fromstring(data.encode("utf-8") if isinstance(data, str) else data,
                            parser=parser, base_url=base_url)
    require(not root.getroottree().docinfo.doctype, "DTD is not permitted in the teaching contract")
    return root


def qname(value, context):
    require(bool(value), "Missing QName reference")
    value = value.strip()
    parts = value.split(":")
    require(len(parts) <= 2, f"Invalid QName: {value}")
    if len(parts) == 2:
        prefix, local = parts
        require(prefix in context.nsmap, f"Unbound QName prefix: {value}")
        return context.nsmap[prefix], local
    return context.nsmap.get(None, ""), value


schema_path = CONTRACTS / "course_api.xsd"
schema_root = parse_xml(schema_path.read_bytes(), base_url=schema_path.as_uri())
require(schema_root.tag == f"{{{XML_SCHEMA_NS}}}schema", "Not an XML Schema document")
require(schema_root.get("targetNamespace") == APP, "Unexpected application schema namespace")
require(not schema_root.findall(f"{{{XML_SCHEMA_NS}}}import"), "Application schema must not fetch external imports")
require(not schema_root.findall(f"{{{XML_SCHEMA_NS}}}include"), "Application schema must be self-contained")
require(not schema_root.findall(f"{{{XML_SCHEMA_NS}}}redefine"), "Application schema must not redefine external types")
schema = etree.XMLSchema(schema_root)
elements = {(APP, node.get("name")) for node in schema_root.findall(f"{{{XML_SCHEMA_NS}}}element")}
require({(APP, "GetCourse"), (APP, "GetCourseResponse"), (APP, "CourseFault")} <= elements,
        "Request, response and fault elements must all be declared")

wsdl_path = CONTRACTS / "course_api.wsdl"
wsdl = parse_xml(wsdl_path.read_bytes(), base_url=wsdl_path.as_uri())
require(wsdl.tag == f"{{{WSDL}}}definitions", "Expected WSDL 1.1 definitions")
target = wsdl.get("targetNamespace")
require(bool(target), "WSDL target namespace must be explicit")
messages = {(target, node.get("name")): node for node in wsdl.findall(f"{{{WSDL}}}message")}
ports = {(target, node.get("name")): node for node in wsdl.findall(f"{{{WSDL}}}portType")}
bindings = {(target, node.get("name")): node for node in wsdl.findall(f"{{{WSDL}}}binding")}
require(len(ports) == 1 and len(bindings) == 1, "Teaching WSDL must have one port type and binding")
for message in messages.values():
    parts = message.findall(f"{{{WSDL}}}part")
    require(len(parts) == 1 and parts[0].get("element"), "Document/literal messages reference one element")
    require(qname(parts[0].get("element"), parts[0]) in elements, "Message element is not in the local schema")
operations = next(iter(ports.values())).findall(f"{{{WSDL}}}operation")
require(len(operations) == 1 and operations[0].get("name") == contract["operation"], "Unexpected operation scope")
for direction in ["input", "output", "fault"]:
    nodes = operations[0].findall(f"{{{WSDL}}}{direction}")
    require(len(nodes) == 1, f"GetCourse needs one {direction}")
    require(qname(nodes[0].get("message"), nodes[0]) in messages, f"Unresolved {direction} message")
    message = messages[qname(nodes[0].get("message"), nodes[0])]
    element = message.find(f"{{{WSDL}}}part")
    expected = {"input": "GetCourse", "output": "GetCourseResponse", "fault": "CourseFault"}[direction]
    require(qname(element.get("element"), element) == (APP, expected), f"Wrong {direction} payload association")
binding = next(iter(bindings.values()))
require(qname(binding.get("type"), binding) in ports, "Unresolved port type")
soap_binding = binding.find(f"{{{SOAP_BINDING}}}binding")
require(soap_binding is not None and soap_binding.get("style") == "document", "Expected SOAP 1.2 document binding")
require(soap_binding.get("transport") == "http://schemas.xmlsoap.org/soap/http", "Expected HTTP transport")
bound_operations = binding.findall(f"{{{WSDL}}}operation")
require(len(bound_operations) == 1 and bound_operations[0].get("name") == contract["operation"], "Wrong bound operation")
action = bound_operations[0].find(f"{{{SOAP_BINDING}}}operation")
require(action is not None and action.get("soapAction") == contract["action"], "Wrong SOAP action")
for direction in ["input", "output"]:
    body = bound_operations[0].find(f"{{{WSDL}}}{direction}/{{{SOAP_BINDING}}}body")
    require(body is not None and body.get("use") == "literal", f"{direction} must use literal body")
fault_binding = bound_operations[0].find(f"{{{WSDL}}}fault/{{{SOAP_BINDING}}}fault")
require(fault_binding is not None and fault_binding.get("use") == "literal", "Fault must use literal body")
service_ports = wsdl.findall(f"{{{WSDL}}}service/{{{WSDL}}}port")
require(len(service_ports) == 1, "Expected one teaching service port")
require(qname(service_ports[0].get("binding"), service_ports[0]) in bindings, "Unresolved service binding")
address = service_ports[0].find(f"{{{SOAP_BINDING}}}address")
require(address is not None and address.get("location") == contract["endpoint"], "Wrong illustrative address")
includes = wsdl.findall(f"{{{WSDL}}}types/{{{XML_SCHEMA_NS}}}schema/{{{XML_SCHEMA_NS}}}include")
require(len(includes) == 1, "WSDL types must include the local schema")
require((CONTRACTS / includes[0].get("schemaLocation", "")).resolve() == schema_path,
        "WSDL schema location must resolve to the local application XSD")

lesson = (ROOT / "docs/lessons/SOAP-XML-AND-ENTERPRISE-CONTRACTS.md").read_text()


def published(name):
    match = re.search(r"<!-- example: " + re.escape(name) + r" -->\s*```xml\s*([\s\S]*?)```", lesson)
    require(match is not None, f"Missing published SOAP example: {name}")
    return match.group(1)


def envelope_body(xml):
    root = parse_xml(xml)
    require(root.tag == f"{{{ENV}}}Envelope", "Expected SOAP 1.2 envelope namespace")
    tags = [child.tag for child in root]
    require(tags in [[f"{{{ENV}}}Body"], [f"{{{ENV}}}Header", f"{{{ENV}}}Body"]],
            "SOAP envelope needs one ordered Body and at most one Header")
    body = root.find(f"{{{ENV}}}Body")
    require(len(body) == 1, "This teaching operation needs exactly one body payload")
    return body[0]


request_xml = published("soap-get-course-request")
response_xml = published("soap-get-course-response")
request = envelope_body(request_xml)
response = envelope_body(response_xml)
require(request.tag == f"{{{APP}}}GetCourse", "Wrong request element")
require(response.tag == f"{{{APP}}}GetCourseResponse", "Wrong response element")
schema.assertValid(request)
schema.assertValid(response)
for boundary in [0, 2147483647]:
    valid_boundary = copy.deepcopy(response)
    valid_boundary.find(f"{{{APP}}}course/{{{APP}}}seats").text = str(boundary)
    schema.assertValid(valid_boundary)
require(request.findtext(f"{{{APP}}}courseId") == course["id"], "Request does not ask for the canonical course")
response_course = response.find(f"{{{APP}}}course")
require(response_course is not None, "Missing wrapped course")
actual = {etree.QName(node).localname: node.text for node in response_course}
require(actual == {"id": course["id"], "title": course["title"], "seats": str(course["seats"])},
        "SOAP representation must retain the current three course fields")

fault = envelope_body(published("soap-not-found-fault"))
require(fault.tag == f"{{{ENV}}}Fault", "Expected SOAP Fault")
code = fault.find(f"{{{ENV}}}Code/{{{ENV}}}Value")
require(code is not None and qname(code.text, code) == (ENV, "Sender"), "Expected SOAP 1.2 Sender code")
reason = fault.find(f"{{{ENV}}}Reason/{{{ENV}}}Text")
require(reason is not None and reason.get(f"{{{XML_NS}}}lang") and reason.text, "Fault reason needs text and xml:lang")
detail = fault.find(f"{{{ENV}}}Detail")
require(detail is not None and len(detail) == 1 and detail[0].tag == f"{{{APP}}}CourseFault", "Wrong fault detail")
schema.assertValid(detail[0])
require(detail[0].findtext(f"{{{APP}}}code") == "NOT_FOUND", "Expected named not-found application result")

rejected = 0


def reject_payload(payload):
    global rejected
    require(not schema.validate(payload), "Expected XML Schema rejection")
    rejected += 1


for value in ["-1", "2.5", "twenty-nine", "2147483648"]:
    invalid = copy.deepcopy(response)
    invalid.find(f"{{{APP}}}course/{{{APP}}}seats").text = value
    reject_payload(invalid)
for field in ["id", "title"]:
    invalid = copy.deepcopy(response)
    invalid.find(f"{{{APP}}}course/{{{APP}}}{field}").text = ""
    reject_payload(invalid)
invalid = copy.deepcopy(response)
invalid_course = invalid.find(f"{{{APP}}}course")
invalid_course.remove(invalid_course.find(f"{{{APP}}}id"))
reject_payload(invalid)
invalid = copy.deepcopy(response)
etree.SubElement(invalid.find(f"{{{APP}}}course"), f"{{{APP}}}summary").text = "Unexpected v1 field"
reject_payload(invalid)
invalid = copy.deepcopy(response)
invalid.find(f"{{{APP}}}course/{{{APP}}}title").tag = "{urn:wrong}title"
reject_payload(invalid)
for value in ["", "x" * 129]:
    invalid = copy.deepcopy(request)
    invalid.find(f"{{{APP}}}courseId").text = value
    reject_payload(invalid)
invalid = copy.deepcopy(request)
invalid.remove(invalid.find(f"{{{APP}}}courseId"))
reject_payload(invalid)

for invalid_xml in [
    request_xml.replace(ENV, "http://schemas.xmlsoap.org/soap/envelope/"),
    '<!DOCTYPE demo><demo/>',
]:
    try:
        envelope_body(invalid_xml)
    except AssertionError:
        rejected += 1
    else:
        raise AssertionError("Expected namespace/DTD rejection")

print(f"Compiled local XSD; validated published request/response/fault and all WSDL references; rejected {rejected} invalid XML cases.")
print(f"Published UTF-8 envelope bytes: request={len(request_xml.encode('utf-8'))}, response={len(response_xml.encode('utf-8'))}.")
print("These are payload/schema/structural checks, not a running SOAP stack, generated proxy, WS-Security verification or production benchmark.")
