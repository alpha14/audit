import {rules, rulesPerPage} from "./rules";
import {Metadata, Result} from "./types";

const commandLineArgs = require("command-line-args");
const audit = require("eco-index-audit/src/ecoindex/audit");
const puppeteer = require("puppeteer");
const path = require("path");


const optionDefinitions = [
  { name: "path", type: String },
  { name: "url", type: String, multiple: true },
];

(async () => {
  const options = commandLineArgs(optionDefinitions);

  const result: Partial<Result> = {
    audits: {
      global: {},
    },
  };

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const metadata: Metadata = {};
  try {
    const fullPath = path.resolve(options.path);
    const packageJson = require(fullPath + "/package.json");
    metadata.packageJson = packageJson;
  } catch (e) {}

  for (let rule of rules) {
    const auditResult = await rule(page, metadata);
    if (auditResult && result.audits) {
      result.audits.global[auditResult.name] = auditResult;
    }
  }

  const devToolsResponses = new Map();
  const devTools = await page.target().createCDPSession();
  await devTools.send("Network.enable");

  const requests: any = {};
  devTools.on("Network.responseReceived", (event: any) => {
    requests[event.requestId] = {
      url: event.response.url,
    };
    devToolsResponses.set(event.requestId, event.response);
  });

  devTools.on("Network.loadingFinished", (event: any) => {
    requests[event.requestId] = {
      ...requests[event.requestId],
      size: event.encodedDataLength,
    };
  });
  for (const url of options.url) {
    if (result.audits) {
      result.audits[url] = {};
    }

    result.ecoIndex = await audit(url);
    await page.goto(url);
    for (let rule of rulesPerPage) {
      const auditResult = await rule(page, metadata);
      if (auditResult && result.audits) {
        result.audits[url][auditResult.name] = auditResult;
      }
    }
  }

  const domain = Object.values(requests)
    .map((request: any) => request.url)
    .map((url) => new URL(url).hostname)
    .reduce((acc: { [key: string]: number }, domain: string) => {
      if (acc[domain]) {
        return {
          ...acc,
          [domain]: acc[domain] + 1,
        };
      } else {
        return {
          ...acc,
          [domain]: 1,
        };
      }
    }, {});

  if (Object.keys(domain).length > 3 && result.audits) {
    result.audits.global["check-if-less-three-domains"] = {
      name: "check-if-less-three-domains",
      message: "Vous devez utiliser moins de trois domaines",
      payload: domain,
    };
  }

  const topFive = Object.values(requests)
    .sort((r1: any, r2: any) => r2.size - r1.size)
    .splice(0, 5);

  result.biggestRequest = topFive as any;

  await browser.close();
  console.log(result);
})();
