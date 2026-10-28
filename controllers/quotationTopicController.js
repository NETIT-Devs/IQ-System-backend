
const {
  createTopic,
  getAllTopics,
} = require("../models/quotationTopicModel");

async function addTopic(req, res) {
  try {
    const { topic_title, topic_description } = req.body;

    if (!topic_title || !topic_title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Topic title is required.",
      });
    }

    const topicId = await createTopic(
      topic_title.trim(),
      topic_description?.trim() || null,
      req.user.user_id
    );

    return res.status(201).json({
      success: true,
      message: "Quotation topic added successfully.",
      topic_id: topicId,
    });
  } catch (error) {
    console.error("Add topic error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add quotation topic.",
    });
  }
}

async function listTopics(req, res) {
  try {
    const topics = await getAllTopics();

    return res.status(200).json({
      success: true,
      topics,
    });
  } catch (error) {
    console.error("List topics error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve quotation topics.",
    });
  }
}

module.exports = {
  addTopic,
  listTopics,
};
