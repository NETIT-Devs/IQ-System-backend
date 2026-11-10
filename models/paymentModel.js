const db = require("../config/db");
const { getPeriodCondition, normalizePeriod } = require("../utils/periodFilter");

async function getPayments(userId, role, requestedPeriod) {
  const period = normalizePeriod(requestedPeriod);
  if (!period) {
    throw new Error("Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.");
  }
  const conditions = [getPeriodCondition("p.payment_date", period)];
  const params = [];
  if (role !== "Super Admin") {
    conditions.push("p.received_by = ?");
    params.push(userId);
  }

  const [rows] = await db.execute(
    `SELECT
       p.payment_id,
       p.invoice_id,
       p.quotation_id,
       p.received_by,
       u.full_name AS received_by_name,
       p.payment_date,
       p.amount,
       p.payment_method,
       p.payment_type,
       p.reference_number,
       p.payment_slip,
       p.payment_status,
       p.verified_by,
       verifier.full_name AS verified_by_name,
       p.verified_at,
       p.rejection_reason,
       p.notes,
       p.created_at,
       q.quotation_number,
       q.customer_id,
       c.customer_name,
       i.invoice_number,
       COALESCE(i.currency, q.currency, 'LKR') AS currency,
       COALESCE(i.total_amount, q.total_amount, 0) AS total_amount,
       COALESCE(i.total_amount, q.total_amount, 0) AS full_amount,
       CASE
         WHEN i.invoice_id IS NOT NULL THEN i.amount_paid
         ELSE COALESCE(quotation_payment_totals.verified_amount, 0)
       END AS amount_paid,
       CASE
         WHEN i.invoice_id IS NOT NULL THEN i.amount_paid
         ELSE COALESCE(quotation_payment_totals.verified_amount, 0)
       END AS paid_amount,
       CASE
         WHEN i.invoice_id IS NOT NULL THEN i.balance_due
         ELSE GREATEST(
           COALESCE(q.total_amount, 0)
             - COALESCE(quotation_payment_totals.verified_amount, 0),
           0
         )
       END AS balance_due,
       CASE
         WHEN i.invoice_id IS NOT NULL THEN i.balance_due
         ELSE GREATEST(
           COALESCE(q.total_amount, 0)
             - COALESCE(quotation_payment_totals.verified_amount, 0),
           0
         )
       END AS remaining_amount,
       CASE
         WHEN i.invoice_id IS NOT NULL
           THEN COALESCE(invoice_payment_totals.pending_amount, 0)
         ELSE COALESCE(quotation_payment_totals.pending_amount, 0)
       END AS pending_payment_amount,
       GREATEST(
         COALESCE(i.total_amount, q.total_amount, 0)
           - CASE
               WHEN i.invoice_id IS NOT NULL THEN i.amount_paid
               ELSE COALESCE(quotation_payment_totals.verified_amount, 0)
             END
           - CASE
               WHEN i.invoice_id IS NOT NULL
                 THEN COALESCE(invoice_payment_totals.pending_amount, 0)
               ELSE COALESCE(quotation_payment_totals.pending_amount, 0)
             END,
         0
       ) AS available_payment_amount,
       COALESCE(i.status, q.status) AS related_status
     FROM payments p
     LEFT JOIN users u
       ON u.user_id = p.received_by
     LEFT JOIN quotations q
       ON q.quotation_id = p.quotation_id
     LEFT JOIN invoices i
       ON i.invoice_id = p.invoice_id
     LEFT JOIN customers c
       ON c.customer_id = COALESCE(q.customer_id, i.customer_id)
     LEFT JOIN (
       SELECT
         invoice_id,
         SUM(CASE WHEN payment_status = 'Pending' THEN amount ELSE 0 END)
           AS pending_amount
       FROM payments
       WHERE invoice_id IS NOT NULL
       GROUP BY invoice_id
     ) invoice_payment_totals
       ON invoice_payment_totals.invoice_id = i.invoice_id
     LEFT JOIN (
       SELECT
         quotation_id,
         SUM(CASE WHEN payment_status = 'Verified' THEN amount ELSE 0 END)
           AS verified_amount,
         SUM(CASE WHEN payment_status = 'Pending' THEN amount ELSE 0 END)
           AS pending_amount
       FROM payments
       WHERE quotation_id IS NOT NULL
       GROUP BY quotation_id
     ) quotation_payment_totals
       ON quotation_payment_totals.quotation_id = q.quotation_id
     LEFT JOIN users verifier
       ON verifier.user_id = p.verified_by
     WHERE ${conditions.join(" AND ")}
     ORDER BY p.created_at DESC, p.payment_id DESC`,
    params
  );

  return rows;
}

async function getPaymentSummary(userId, role, requestedPeriod) {
  const period = normalizePeriod(requestedPeriod);
  if (!period) {
    throw new Error("Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.");
  }
  const isSuperAdmin = role === "Super Admin";
  const paymentConditions = [getPeriodCondition("p.payment_date", period)];
  if (!isSuperAdmin) paymentConditions.push("p.received_by = ?");
  const paymentParams = isSuperAdmin ? [] : [userId];
  const invoiceConditions = [
    "i.status <> 'Cancelled'",
    getPeriodCondition("i.invoice_date", period),
  ];
  const quotationConditions = [
    "i.invoice_id IS NULL",
    "q.status <> 'Cancelled'",
    getPeriodCondition("q.quotation_date", period),
  ];
  if (!isSuperAdmin) {
    invoiceConditions.push("i.created_by = ?");
    quotationConditions.push("q.created_by = ?");
  }
  const invoiceCondition = `WHERE ${invoiceConditions.join(" AND ")}`;
  const quotationCondition = `WHERE ${quotationConditions.join(" AND ")}`;

  const [[paymentTotals]] = await db.execute(
    `SELECT
       COUNT(*) AS payment_count,
       SUM(p.payment_status = 'Verified') AS verified_count,
       SUM(p.payment_status = 'Pending') AS pending_count,
       SUM(p.payment_status = 'Rejected') AS rejected_count,
       COALESCE(SUM(
         CASE
           WHEN p.payment_status = 'Verified' AND p.payment_type = 'Advance'
             THEN p.amount
           ELSE 0
         END
       ), 0) AS verified_advance_amount,
       COALESCE(SUM(CASE WHEN p.payment_status = 'Verified' THEN p.amount ELSE 0 END), 0)
         AS verified_amount,
       COALESCE(SUM(CASE WHEN p.payment_status = 'Pending' THEN p.amount ELSE 0 END), 0)
         AS pending_amount,
       COALESCE(SUM(CASE WHEN p.payment_status = 'Rejected' THEN p.amount ELSE 0 END), 0)
         AS rejected_amount
     FROM payments p
     WHERE ${paymentConditions.join(" AND ")}`,
    paymentParams
  );

  const [[balanceTotals]] = await db.execute(
    `SELECT
       (
         SELECT COALESCE(SUM(i.balance_due), 0)
         FROM invoices i
         ${invoiceCondition}
       ) +
       (
         SELECT COALESCE(
           SUM(
             GREATEST(
               q.total_amount - COALESCE(payment_totals.verified_amount, 0),
               0
             )
           ),
           0
         )
         FROM quotations q
         LEFT JOIN invoices i
           ON i.quotation_id = q.quotation_id
         LEFT JOIN (
           SELECT quotation_id, SUM(amount) AS verified_amount
           FROM payments
           WHERE payment_status = 'Verified'
           GROUP BY quotation_id
         ) payment_totals
           ON payment_totals.quotation_id = q.quotation_id
         ${quotationCondition}
       ) AS outstanding_balance`,
    isSuperAdmin ? [] : [userId, userId]
  );

  return {
    payment_count: Number(paymentTotals.payment_count),
    verified_count: Number(paymentTotals.verified_count || 0),
    pending_count: Number(paymentTotals.pending_count || 0),
    rejected_count: Number(paymentTotals.rejected_count || 0),
    verified_advance_amount: Number(paymentTotals.verified_advance_amount),
    verified_amount: Number(paymentTotals.verified_amount),
    paid_amount: Number(paymentTotals.verified_amount),
    pending_amount: Number(paymentTotals.pending_amount),
    rejected_amount: Number(paymentTotals.rejected_amount),
    outstanding_balance: Number(balanceTotals.outstanding_balance),
  };
}

async function createPendingPayment(payment) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const ownerCondition =
      payment.role === "Super Admin" ? "" : "AND created_by = ?";
    const ownerParams =
      payment.role === "Super Admin" ? [] : [payment.userId];
    const [quotations] = await connection.execute(
      `SELECT quotation_id, customer_id, total_amount
       FROM quotations
       WHERE quotation_id = ?
         ${ownerCondition}
       FOR UPDATE`,
      [payment.quotationId, ...ownerParams]
    );

    if (quotations.length === 0) {
      const error = new Error(
        "Quotation was not found or is not accessible."
      );
      error.code = "QUOTATION_NOT_FOUND";
      throw error;
    }

    const quotation = quotations[0];
    if (Number(quotation.customer_id) !== payment.customerId) {
      const error = new Error(
        "Selected customer does not match the selected quotation."
      );
      error.code = "QUOTATION_CUSTOMER_MISMATCH";
      throw error;
    }

    const [existingPayments] = await connection.execute(
      `SELECT COALESCE(SUM(amount), 0) AS reserved_amount
       FROM payments
       WHERE quotation_id = ?
         AND payment_status <> 'Rejected'`,
      [payment.quotationId]
    );
    const reservedAmount = Number(existingPayments[0].reserved_amount);
    const remainingAmount = Number(
      (Number(quotation.total_amount) - reservedAmount).toFixed(2)
    );

    if (payment.amount > remainingAmount) {
      const error = new Error(
        "Payment amount exceeds the remaining quotation amount."
      );
      error.code = "PAYMENT_EXCEEDS_QUOTATION_TOTAL";
      throw error;
    }

    const [invoices] = await connection.execute(
      `SELECT invoice_id
       FROM invoices
       WHERE quotation_id = ?
       LIMIT 1`,
      [payment.quotationId]
    );

    const invoiceId = invoices[0]?.invoice_id || null;
    if (invoiceId) {
      const [[invoice]] = await connection.execute(
        `SELECT balance_due
         FROM invoices
         WHERE invoice_id = ?
         FOR UPDATE`,
        [invoiceId]
      );
      const [[pendingPayments]] = await connection.execute(
        `SELECT COALESCE(SUM(amount), 0) AS pending_amount
         FROM payments
         WHERE invoice_id = ?
           AND payment_status = 'Pending'`,
        [invoiceId]
      );
      if (
        Number(
          (payment.amount + Number(pendingPayments.pending_amount)).toFixed(2)
        ) >
        Number(invoice.balance_due)
      ) {
        const error = new Error(
          "Payment amount exceeds the invoice balance due."
        );
        error.code = "PAYMENT_EXCEEDS_INVOICE_BALANCE";
        throw error;
      }
    }

    const [result] = await connection.execute(
      `INSERT INTO payments (
         invoice_id,
         quotation_id,
         received_by,
         payment_date,
         amount,
         payment_method,
         reference_number,
         notes,
         payment_type,
         payment_slip,
         payment_status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [
        invoiceId,
        payment.quotationId,
        payment.userId,
        payment.paymentDate,
        payment.amount,
        payment.paymentMethod,
        payment.referenceNumber || null,
        payment.notes || null,
        payment.paymentType,
        payment.paymentSlip,
      ]
    );

    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function verifyPayment(paymentId, verifiedBy) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [paymentReferences] = await connection.execute(
      `SELECT quotation_id
       FROM payments
       WHERE payment_id = ?`,
      [paymentId]
    );

    if (paymentReferences.length === 0) {
      await connection.rollback();
      return null;
    }

    let quotation = null;
    if (paymentReferences[0].quotation_id) {
      const [quotationRows] = await connection.execute(
        `SELECT quotation_id, total_amount
         FROM quotations
         WHERE quotation_id = ?
         FOR UPDATE`,
        [paymentReferences[0].quotation_id]
      );
      if (quotationRows.length === 0) {
        const error = new Error("Linked quotation was not found.");
        error.code = "QUOTATION_NOT_FOUND";
        throw error;
      }
      quotation = quotationRows[0];
    }

    const [payments] = await connection.execute(
      `SELECT payment_id, invoice_id, quotation_id, amount, payment_status
       FROM payments
       WHERE payment_id = ?
       FOR UPDATE`,
      [paymentId]
    );
    if (payments.length === 0) {
      await connection.rollback();
      return null;
    }
    const payment = payments[0];
    if (payment.payment_status !== "Pending") {
      const error = new Error("Only pending payments can be verified.");
      error.code = "PAYMENT_NOT_PENDING";
      throw error;
    }

    let invoice = null;
    if (payment.quotation_id) {
      const [verifiedRows] = await connection.execute(
        `SELECT COALESCE(SUM(amount), 0) AS verified_amount
         FROM payments
         WHERE quotation_id = ?
           AND payment_status = 'Verified'
           AND payment_id <> ?`,
        [payment.quotation_id, paymentId]
      );
      const verifiedTotal = Number(
        (
          Number(verifiedRows[0].verified_amount) + Number(payment.amount)
        ).toFixed(2)
      );

      if (verifiedTotal > Number(quotation.total_amount)) {
        const error = new Error(
          "Verified payments cannot exceed the quotation total."
        );
        error.code = "PAYMENT_EXCEEDS_QUOTATION_TOTAL";
        throw error;
      }
    }

    if (payment.invoice_id) {
      const [invoiceRows] = await connection.execute(
        `SELECT invoice_id, total_amount, amount_paid, balance_due, status
         FROM invoices
         WHERE invoice_id = ?
         FOR UPDATE`,
        [payment.invoice_id]
      );
      if (invoiceRows.length === 0) {
        const error = new Error("Linked invoice was not found.");
        error.code = "INVOICE_NOT_FOUND";
        throw error;
      }
      invoice = invoiceRows[0];

      if (
        invoice.status === "Cancelled" ||
        Number(payment.amount) > Number(invoice.balance_due)
      ) {
        const error = new Error(
          invoice.status === "Cancelled"
            ? "Payments cannot be verified for a cancelled invoice."
            : "Verified payment exceeds the invoice balance due."
        );
        error.code =
          invoice.status === "Cancelled"
            ? "INVOICE_CANCELLED"
            : "PAYMENT_EXCEEDS_INVOICE_BALANCE";
        throw error;
      }
    }

    await connection.execute(
      `UPDATE payments
       SET payment_status = 'Verified',
           verified_by = ?,
           verified_at = NOW(),
           rejection_reason = NULL
       WHERE payment_id = ?`,
      [verifiedBy, paymentId]
    );

    if (invoice) {
      const amountPaid = Number(
        (Number(invoice.amount_paid) + Number(payment.amount)).toFixed(2)
      );
      const balanceDue = Number(
        (Number(invoice.total_amount) - amountPaid).toFixed(2)
      );
      await connection.execute(
        `UPDATE invoices
         SET amount_paid = ?,
             balance_due = ?,
             status = CASE WHEN ? = 0 THEN 'Paid' ELSE status END
         WHERE invoice_id = ?`,
        [amountPaid, balanceDue, balanceDue, invoice.invoice_id]
      );
    }

    await connection.commit();
    return {
      payment_id: paymentId,
      payment_status: "Verified",
      invoice_id: payment.invoice_id,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function rejectPayment(paymentId, rejectedBy, rejectionReason) {
  const [result] = await db.execute(
    `UPDATE payments
     SET payment_status = 'Rejected',
         rejection_reason = ?,
         verified_by = ?,
         verified_at = NOW()
     WHERE payment_id = ?
       AND payment_status = 'Pending'`,
    [rejectionReason, rejectedBy, paymentId]
  );

  if (result.affectedRows > 0) {
    return true;
  }

  const [rows] = await db.execute(
    `SELECT payment_id
     FROM payments
     WHERE payment_id = ?
     LIMIT 1`,
    [paymentId]
  );

  if (rows.length === 0) {
    return null;
  }

  const error = new Error("Only pending payments can be rejected.");
  error.code = "PAYMENT_NOT_PENDING";
  throw error;
}

module.exports = {
  getPayments,
  getPaymentSummary,
  createPendingPayment,
  verifyPayment,
  rejectPayment,
};
