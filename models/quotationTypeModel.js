
const db = require("../config/db");

async function getAllTypes() {
  const [rows] = await db.execute(
    `SELECT type_id, type_name, description, created_by,
            created_at, updated_at
     FROM quotation_types
     ORDER BY type_name ASC`
  );

  return rows;
}

async function createType(typeName, description, createdBy) {
  const [result] = await db.execute(
    `INSERT INTO quotation_types
      (type_name, description, created_by)
     VALUES (?, ?, ?)`,
    [typeName, description || null, createdBy]
  );

  return result.insertId;
}

async function updateType(typeId, typeName, description) {
  const [result] = await db.execute(
    `UPDATE quotation_types
     SET type_name = ?, description = ?
     WHERE type_id = ?`,
    [typeName, description || null, typeId]
  );

  return result.affectedRows;
}

async function deleteType(typeId) {
  const [result] = await db.execute(
    `DELETE FROM quotation_types WHERE type_id = ?`,
    [typeId]
  );

  return result.affectedRows;
}

module.exports = {
  getAllTypes,
  createType,
  updateType,
  deleteType,
};
