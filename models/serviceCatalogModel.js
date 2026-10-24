
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

module.exports = {
  getActiveServices,
};
