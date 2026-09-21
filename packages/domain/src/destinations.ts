import { z } from "zod";
import type { Prisma } from "@maw/db";
import { DESTINATION_TYPES, MawError } from "@maw/shared";
import { audit } from "./audit";
import { isUniqueViolation, requireRole } from "./context";
import type { Actor, Deps } from "./context";

const supplierSchema = z.object({
  name: z.string().min(1).max(160),
  category: z.string().min(1).max(60),
  supplierGroup: z.string().min(1).max(60).default("approved"),
  externalReference: z.string().max(200).optional(),
  metadata: z.record(z.unknown()).optional()
});

const destinationSchema = z.object({
  type: z.enum(DESTINATION_TYPES),
  label: z.string().min(1).max(160),
  addressOrReference: z.string().min(1).max(300),
  network: z.string().min(2).max(40),
  supplierId: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional()
});

export async function createSupplier(deps: Deps, actor: Actor, input: unknown) {
  requireRole(actor, "MAW.Admin", "MAW.WalletOperator");
  const data = supplierSchema.parse(input);
  const supplier = await deps.db.supplier.create({
    data: {
      tenantId: actor.tenantId,
      name: data.name,
      category: data.category,
      supplierGroup: data.supplierGroup,
      externalReference: data.externalReference,
      metadataJson: (data.metadata ?? {}) as Prisma.InputJsonValue
    }
  });
  await audit(deps.db, actor, { eventType: "supplier.created", resourceType: "supplier", resourceId: supplier.id, outcome: "success" });
  return supplier;
}

export async function setSupplierStatus(deps: Deps, actor: Actor, supplierId: string, status: "active" | "blocked") {
  requireRole(actor, "MAW.Admin", "MAW.PolicyAdmin");
  const supplier = await deps.db.supplier.findFirst({ where: { id: supplierId, tenantId: actor.tenantId } });
  if (!supplier) throw new MawError("not_found", "Supplier not found");
  const updated = await deps.db.supplier.update({ where: { id: supplierId }, data: { status } });
  await audit(deps.db, actor, { eventType: `supplier.${status}`, resourceType: "supplier", resourceId: supplierId, outcome: "success" });
  return updated;
}

export async function listSuppliers(deps: Deps, actor: Actor) {
  return deps.db.supplier.findMany({ where: { tenantId: actor.tenantId }, include: { destinations: true }, orderBy: { name: "asc" } });
}

export async function createDestination(deps: Deps, actor: Actor, input: unknown) {
  requireRole(actor, "MAW.Admin", "MAW.WalletOperator");
  const data = destinationSchema.parse(input);
  if (data.supplierId) {
    const supplier = await deps.db.supplier.findFirst({ where: { id: data.supplierId, tenantId: actor.tenantId } });
    if (!supplier) throw new MawError("not_found", "Supplier not found");
  }
  try {
    const destination = await deps.db.destination.create({
      data: {
        tenantId: actor.tenantId,
        type: data.type,
        label: data.label,
        addressOrReference: data.addressOrReference,
        network: data.network,
        supplierId: data.supplierId,
        status: "pending_verification",
        metadataJson: (data.metadata ?? {}) as Prisma.InputJsonValue
      }
    });
    await audit(deps.db, actor, { eventType: "destination.created", resourceType: "destination", resourceId: destination.id, outcome: "success", details: { network: data.network, type: data.type } });
    return destination;
  } catch (error) {
    if (isUniqueViolation(error)) throw new MawError("conflict", "A destination with this network and address already exists");
    throw error;
  }
}

export async function setDestinationStatus(deps: Deps, actor: Actor, destinationId: string, status: "active" | "blocked") {
  requireRole(actor, "MAW.Admin", "MAW.PolicyAdmin");
  const destination = await deps.db.destination.findFirst({ where: { id: destinationId, tenantId: actor.tenantId } });
  if (!destination) throw new MawError("not_found", "Destination not found");
  const updated = await deps.db.destination.update({ where: { id: destinationId }, data: { status } });
  await audit(deps.db, actor, {
    eventType: status === "active" ? "destination.approved" : "destination.blocked",
    resourceType: "destination",
    resourceId: destinationId,
    outcome: "success"
  });
  return updated;
}

export async function listDestinations(deps: Deps, actor: Actor) {
  return deps.db.destination.findMany({ where: { tenantId: actor.tenantId }, include: { supplier: true }, orderBy: { createdAt: "desc" } });
}
