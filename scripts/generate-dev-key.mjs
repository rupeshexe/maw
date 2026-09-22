import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ed25519");
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const encoded = Buffer.from(pem, "utf8").toString("base64");

console.log("Add the following line to your local .env file:\n");
console.log(`RECEIPT_SIGNING_KEY_PEM=${encoded}`);
console.log("\nThis key signs receipts for local development only. Do not commit it or reuse it in production.");
