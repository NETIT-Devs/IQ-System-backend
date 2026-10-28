
const {
  getAllTypes,
  createType,
  updateType,
  deleteType,
} = require("../models/quotationTypeModel");

async function listTypes(req, res) {
  try {
    const types = await getAllTypes();

    return res.status(200).json({
      success: true,
      types,
    });
  } catch (error) {
    console.error("List quotation types error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve quotation types.",
    });
  }
}

async function addType(req, res) {
  try {
    const { type_name, description } = req.body;

    if (!type_name || !type_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Type name is required.",
      });
    }

    const typeId = await createType(
      type_name.trim(),
      description?.trim() || null,
      req.user.user_id
    );

    return res.status(201).json({
      success: true,
      message: "Quotation type added successfully.",
      type_id: typeId,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "This quotation type already exists.",
      });
    }

    console.error("Add quotation type error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add quotation type.",
    });
  }
}

async function editType(req, res) {
  try {
    const typeId = Number(req.params.id);
    const { type_name, description } = req.body;

    if (!Number.isInteger(typeId) || typeId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation type ID.",
      });
    }

    if (!type_name || !type_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Type name is required.",
      });
    }

    const affectedRows = await updateType(
      typeId,
      type_name.trim(),
      description?.trim() || null
    );

    if (!affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Quotation type not found or no changes made.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Quotation type updated successfully.",
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "This quotation type already exists.",
      });
    }

    console.error("Edit quotation type error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update quotation type.",
    });
  }
}

async function removeType(req, res) {
  try {
    const typeId = Number(req.params.id);

    if (!Number.isInteger(typeId) || typeId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation type ID.",
      });
    }

    const affectedRows = await deleteType(typeId);

    if (!affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Quotation type not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Quotation type deleted successfully.",
    });
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        success: false,
        message:
          "This type is used by existing records and cannot be deleted.",
      });
    }

    console.error("Delete quotation type error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete quotation type.",
    });
  }
}

module.exports = {
  listTypes,
  addType,
  editType,
  removeType,
};
