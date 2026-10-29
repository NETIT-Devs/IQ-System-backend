const {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
} = require("../models/serviceCatalogModel");

const serviceFields = [
  "description",
  "hosting_domain",
  "core_features",
  "maintenance_support",
  "content_seo",
];

function validateService(body) {
  const itemName =
    typeof body?.item_name === "string" ? body.item_name.trim() : "";

  if (!itemName) {
    return { error: "Service / item name is required." };
  }

  const price =
    body.default_price === "" ||
    body.default_price === null ||
    body.default_price === undefined
      ? 0
      : Number(body.default_price);

  if (!Number.isFinite(price) || price < 0) {
    return { error: "Default price must be a non-negative number." };
  }

  const rawActive = body.is_active ?? 1;
  const isActive =
    rawActive === true || rawActive === 1 || rawActive === "1"
      ? 1
      : rawActive === false || rawActive === 0 || rawActive === "0"
        ? 0
        : null;

  if (isActive === null) {
    return { error: "is_active must be 0 or 1." };
  }

  const service = {
    item_name: itemName,
    default_price: price,
    is_active: isActive,
  };

  for (const field of serviceFields) {
    const value = body[field];
    if (value !== undefined && value !== null && typeof value !== "string") {
      return { error: `${field} must be a string or null.` };
    }

    service[field] = typeof value === "string" ? value.trim() || null : null;
  }

  return { service };
}

async function listServices(req, res) {
  try {
    const services = await getAllServices();
    return res.status(200).json({ success: true, services });
  } catch (error) {
    console.error("List service catalog error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve service catalog.",
    });
  }
}

async function addService(req, res) {
  const result = validateService(req.body);
  if (result.error) {
    return res.status(400).json({ success: false, message: result.error });
  }

  try {
    const serviceId = await createService(result.service);
    return res.status(201).json({
      success: true,
      message: "Service added successfully.",
      service_id: serviceId,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "This service / item already exists.",
      });
    }

    console.error("Add service catalog item error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add service.",
    });
  }
}

async function editService(req, res) {
  const serviceId = Number(req.params.id);
  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid service ID.",
    });
  }

  const result = validateService(req.body);
  if (result.error) {
    return res.status(400).json({ success: false, message: result.error });
  }

  try {
    const existing = await getServiceById(serviceId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Service not found.",
      });
    }

    await updateService(serviceId, result.service);
    return res.status(200).json({
      success: true,
      message: "Service updated successfully.",
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "This service / item already exists.",
      });
    }

    console.error("Update service catalog item error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update service.",
    });
  }
}

async function removeService(req, res) {
  const serviceId = Number(req.params.id);
  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid service ID.",
    });
  }

  try {
    const affectedRows = await deleteService(serviceId);
    if (!affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Service not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Service deleted successfully.",
    });
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        success: false,
        message: "This service is used by existing records and cannot be deleted.",
      });
    }

    console.error("Delete service catalog item error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete service.",
    });
  }
}

module.exports = {
  listServices,
  addService,
  editService,
  removeService,
};
