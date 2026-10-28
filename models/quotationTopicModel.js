
const db = require("../config/db");

async function createTopic(topicTitle, topicDescription, createdBy) {
  const [result] = await db.execute(
    `INSERT INTO quotation_topics
      (topic_title, topic_description, created_by)
     VALUES (?, ?, ?)`,
    [topicTitle, topicDescription || null, createdBy]
  );

  return result.insertId;
}

async function getAllTopics() {
  const [rows] = await db.execute(
    `SELECT topic_id, topic_title, topic_description, created_by,
            created_at, updated_at
     FROM quotation_topics
     ORDER BY topic_id DESC`
  );

  return rows;
}

module.exports = {
  createTopic,
  getAllTopics,
};
