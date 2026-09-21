import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { MawError } from "@maw/shared";

export interface ReceiptSigner {
  readonly keyId: string;
  readonly algorithm: string;
  sign(hashHex: string): Promise<string>;
  verify(hashHex: string, signature: string, keyId: string): Promise<boolean>;
  publicKeyPem(): Promise<string | null>;
}

export class LocalEd25519Signer implements ReceiptSigner {
  readonly algorithm = "Ed25519";
  readonly keyId: string;
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor(keyId: string, privateKeyPem: string) {
    this.keyId = keyId;
    this.privateKey = createPrivateKey(privateKeyPem);
    if (this.privateKey.asymmetricKeyType !== "ed25519") {
      throw new MawError("misconfigured", "Receipt signing key must be an Ed25519 private key");
    }
    this.publicKey = createPublicKey(this.privateKey);
  }

  static generate(keyId: string): { signer: LocalEd25519Signer; privateKeyPem: string } {
    const { privateKey } = generateKeyPairSync("ed25519");
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    return { signer: new LocalEd25519Signer(keyId, privateKeyPem), privateKeyPem };
  }

  async sign(hashHex: string): Promise<string> {
    return sign(null, Buffer.from(hashHex, "hex"), this.privateKey).toString("base64");
  }

  async verify(hashHex: string, signature: string, keyId: string): Promise<boolean> {
    if (keyId !== this.keyId) return false;
    return verify(null, Buffer.from(hashHex, "hex"), this.publicKey, Buffer.from(signature, "base64"));
  }

  async publicKeyPem(): Promise<string | null> {
    return this.publicKey.export({ type: "spki", format: "pem" }).toString();
  }
}

export class KeyVaultSigner implements ReceiptSigner {
  readonly algorithm = "ES256";
  readonly keyId: string;
  private readonly vaultUrl: string;
  private readonly keyName: string;
  private clientPromise?: Promise<import("@azure/keyvault-keys").CryptographyClient>;

  constructor(vaultUrl: string, keyName: string, keyVersion?: string) {
    this.vaultUrl = vaultUrl.replace(/\/$/, "");
    this.keyName = keyName;
    this.keyId = keyVersion ? `${this.vaultUrl}/keys/${keyName}/${keyVersion}` : `${this.vaultUrl}/keys/${keyName}`;
  }

  private client() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const { DefaultAzureCredential } = await import("@azure/identity");
        const { KeyClient, CryptographyClient } = await import("@azure/keyvault-keys");
        const credential = new DefaultAzureCredential();
        const keys = new KeyClient(this.vaultUrl, credential);
        const key = await keys.getKey(this.keyName);
        return new CryptographyClient(key, credential);
      })();
    }
    return this.clientPromise;
  }

  async sign(hashHex: string): Promise<string> {
    const client = await this.client();
    const result = await client.sign("ES256", Buffer.from(hashHex, "hex"));
    return Buffer.from(result.result).toString("base64");
  }

  async verify(hashHex: string, signature: string, keyId: string): Promise<boolean> {
    if (!keyId.startsWith(`${this.vaultUrl}/keys/${this.keyName}`)) return false;
    const client = await this.client();
    const result = await client.verify("ES256", Buffer.from(hashHex, "hex"), Buffer.from(signature, "base64"));
    return result.result;
  }

  async publicKeyPem(): Promise<string | null> {
    return null;
  }
}

export interface SignerEnv {
  RECEIPT_SIGNER?: string;
  RECEIPT_KEY_ID?: string;
  RECEIPT_SIGNING_KEY_PEM?: string;
  AZURE_KEY_VAULT_URL?: string;
  AZURE_KEY_VAULT_KEY_NAME?: string;
  MAW_MODE?: string;
}

export function createSignerFromEnv(env: SignerEnv): ReceiptSigner {
  const mode = env.RECEIPT_SIGNER ?? "local";
  if (mode === "keyvault") {
    if (!env.AZURE_KEY_VAULT_URL || !env.AZURE_KEY_VAULT_KEY_NAME) {
      throw new MawError("misconfigured", "AZURE_KEY_VAULT_URL and AZURE_KEY_VAULT_KEY_NAME are required for the keyvault signer");
    }
    return new KeyVaultSigner(env.AZURE_KEY_VAULT_URL, env.AZURE_KEY_VAULT_KEY_NAME);
  }
  const keyId = env.RECEIPT_KEY_ID ?? "maw-dev-1";
  if (env.RECEIPT_SIGNING_KEY_PEM) {
    const pem = env.RECEIPT_SIGNING_KEY_PEM.includes("BEGIN")
      ? env.RECEIPT_SIGNING_KEY_PEM.replace(/\\n/g, "\n")
      : Buffer.from(env.RECEIPT_SIGNING_KEY_PEM, "base64").toString("utf8");
    return new LocalEd25519Signer(keyId, pem);
  }
  if ((env.MAW_MODE ?? "demo") !== "demo") {
    throw new MawError("misconfigured", "RECEIPT_SIGNING_KEY_PEM is required outside demo mode");
  }
  return LocalEd25519Signer.generate(`${keyId}-ephemeral`).signer;
}
