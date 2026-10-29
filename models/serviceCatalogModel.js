
const pool = require("../config/db");

async function getActiveServices() {
  const [rows] = await pool.query(
    `SELECT
      service_id,
      item_name,
      description,
      hosting_domain,
      core_features,
      maintenance_support,
      content_seo,
      default_price
    FROM service_catalog
    WHERE is_active = 1
    ORDER BY service_id ASC`
  );

  return rows;
}

async function getAllServices() {
  const [rows] = await pool.query(
    `SELECT
      service_id,
      item_name,
      description,
      hosting_domain,
      core_features,
      maintenance_support,
      content_seo,
      default_price,
      is_active
    FROM service_catalog
    ORDER BY service_id ASC`
  );

  return rows;
}

async function getServiceById(serviceId) {
  const [rows] = await pool.execute(
    `SELECT service_id
     FROM service_catalog
     WHERE service_id = ?
     LIMIT 1`,
    [serviceId]
  );

  return rows[0] || null;
}

async function createService(service) {
  const [result] = await pool.execute(
    `INSERT INTO service_catalog
      (
        item_name,
        description,
        hosting_domain,
        core_features,
        maintenance_support,
        content_seo,
        default_price,
        is_active
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      service.item_name,
      service.description,
      service.hosting_domain,
      service.core_features,
      service.maintenance_support,
      service.content_seo,
      service.default_price,
      service.is_active,
    ]
  );

  return result.insertId;
}

async function updateService(serviceId, service) {
  const [result] = await pool.execute(
    `UPDATE service_catalog
     SET item_name = ?,
         description = ?,
         hosting_domain = ?,
         core_features = ?,
         maintenance_support = ?,
         content_seo = ?,
         default_price = ?,
         is_active = ?
     WHERE service_id = ?`,
    [
      service.item_name,
      service.description,
      service.hosting_domain,
      service.core_features,
      service.maintenance_support,
      service.content_seo,
      service.default_price,
      service.is_active,
      serviceId,
    ]
  );

  return result.affectedRows;
}

async function deleteService(serviceId) {
  const [result] = await pool.execute(
    `DELETE FROM service_catalog
     WHERE service_id = ?`,
    [serviceId]
  );

  return result.affectedRows;
}

module.exports = {
  getActiveServices,
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
};
