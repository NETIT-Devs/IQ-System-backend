const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

// Format an amount using the invoice currency.
function formatMoney(value, currency) {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

// Resolve an uploaded company image without allowing paths outside uploads.
function resolveUploadedImage(imagePath) {
  if (typeof imagePath !== "string" || !imagePath.trim()) {
    return null;
  }

  const filename = path.basename(imagePath);
  const uploadDirectory = path.resolve(__dirname, "..", "uploads");
  const resolvedPath = path.resolve(uploadDirectory, filename);

  return resolvedPath.startsWith(`${uploadDirectory}${path.sep}`) &&
    fs.existsSync(resolvedPath)
    ? resolvedPath
    : null;
}

// Build a professional PDF buffer containing invoice and company details.
function createInvoicePdf(invoice, company = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const pageWidth = doc.page.width;
    const rightEdge = pageWidth - 48;
    const currency = invoice.currency || "LKR";
    const logoPath = resolveUploadedImage(company.company_logo);
    const signaturePath = resolveUploadedImage(company.company_signature);

    if (logoPath) {
      try {
        doc.image(logoPath, 48, 42, { fit: [64, 54] });
      } catch (error) {
        console.warn("Could not add company logo to invoice PDF:", error.message);
      }
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#17365D")
      .text(company.company_name || "Company", logoPath ? 122 : 48, 45, {
        width: logoPath ? 250 : 320,
      });

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#4B5563");

    const companyDetails = [
      company.company_address,
      company.contact_number,
      company.email_address,
    ].filter(Boolean);

    companyDetails.forEach((detail, index) => {
      doc.text(String(detail), logoPath ? 122 : 48, 70 + index * 13, {
        width: 260,
      });
    });

    doc
      .font("Helvetica-Bold")
      .fontSize(24)
      .fillColor("#17365D")
      .text("INVOICE", 360, 48, { width: rightEdge - 360, align: "right" });

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#1F2937")
      .text(`Invoice No: ${invoice.invoice_number}`, 310, 82, {
        width: rightEdge - 310,
        align: "right",
      })
      .text(`Date: ${String(invoice.invoice_date).slice(0, 10)}`, 310, 98, {
        width: rightEdge - 310,
        align: "right",
      });

    if (invoice.due_date) {
      doc.text(`Due Date: ${String(invoice.due_date).slice(0, 10)}`, 310, 114, {
        width: rightEdge - 310,
        align: "right",
      });
    }

    // Add a visible stamp to fully paid invoices.
    if (invoice.status === "Paid") {
      doc
        .roundedRect(rightEdge - 105, 128, 105, 25, 4)
        .lineWidth(2)
        .strokeColor("#16803C")
        .stroke();
      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor("#16803C")
        .text("PAID", rightEdge - 105, 134, {
          width: 105,
          align: "center",
        });
    }

    let y = 145;
    doc.moveTo(48, y).lineTo(rightEdge, y).lineWidth(1.5).stroke("#17365D");
    y += 18;

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#17365D");
    doc.text("BILL TO", 48, y);
    y += 17;
    doc.font("Helvetica").fontSize(10).fillColor("#1F2937");
    [
      invoice.customer_name,
      invoice.customer_company,
      invoice.customer_address,
      invoice.customer_email,
      invoice.customer_phone,
    ]
      .filter(Boolean)
      .forEach((detail) => {
        doc.text(String(detail), 48, y, { width: 260 });
        y += 14;
      });

    y = Math.max(y + 12, 240);
    // Keep invoice table columns aligned across all rows.
    const columns = {
      item: 55,
      description: 225,
      price: 400,
      tax: 460,
      total: 505,
    };

    doc.rect(48, y, rightEdge - 48, 24).fill("#17365D");
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF");
    doc.text("Item", columns.item + 7, y + 7);
    doc.text("Description", columns.description, y + 7);
    doc.text("Price", columns.price, y + 7, { width: 60, align: "right" });
    doc.text("Tax", columns.tax, y + 7, { width: 35, align: "right" });
    doc.text("Total", columns.total, y + 7, { width: 45, align: "right" });
    y += 24;

    doc.font("Helvetica").fontSize(9).fillColor("#1F2937");
    for (const [index, item] of (invoice.items || []).entries()) {
      if (y > 690) {
        doc.addPage();
        y = 55;
      }

      const rowHeight = 32;
      if (index % 2 === 0) {
        doc.rect(48, y, rightEdge - 48, rowHeight).fill("#F3F6FA");
      }
      doc.fillColor("#1F2937");
      doc.text(String(item.item_name || ""), columns.item + 7, y + 8, {
        width: 190,
      });
      doc.text(String(item.description || ""), columns.description, y + 8, {
        width: 170,
      });
      doc.text(formatMoney(item.unit_price ?? item.price, currency), columns.price, y + 8, {
        width: 60,
        align: "right",
      });
      doc.text(`${Number(item.tax_rate || 0).toFixed(2)}%`, columns.tax, y + 8, {
        width: 35,
        align: "right",
      });
      doc.text(formatMoney(item.line_total, currency), columns.total, y + 8, {
        width: 45,
        align: "right",
      });
      y += rowHeight;
    }

    y += 15;
    const summaryX = 380;
    const amountX = 485;
    // Display the financial summary and outstanding balance.
    const summaryRows = [
      ["Subtotal", invoice.subtotal],
      ["Discount", -Number(invoice.discount_amount || 0)],
      ["Tax", invoice.tax_amount],
      ["Total", invoice.total_amount],
      ["Amount Paid", invoice.amount_paid],
      ["Balance Due", invoice.balance_due],
    ];

    summaryRows.forEach(([label, amount]) => {
      if (y > 740) {
        doc.addPage();
        y = 55;
      }
      doc
        .font(label === "Total" || label === "Balance Due" ? "Helvetica-Bold" : "Helvetica")
        .fontSize(label === "Total" || label === "Balance Due" ? 11 : 9)
        .fillColor(label === "Balance Due" ? "#17365D" : "#1F2937")
        .text(label, summaryX, y, { width: 100 });
      doc.text(formatMoney(Math.abs(Number(amount || 0)), currency), amountX, y, {
        width: 100,
        align: "right",
      });
      y += 18;
    });

    if (invoice.notes || invoice.terms_and_conditions || signaturePath) {
      y += 12;
      if (y > 680) {
        doc.addPage();
        y = 55;
      }
    }

    if (invoice.notes) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#17365D").text("Notes", 48, y);
      y += 14;
      doc.font("Helvetica").fontSize(9).fillColor("#1F2937").text(invoice.notes, 48, y, {
        width: rightEdge - 48,
      });
      y = doc.y + 10;
    }

    if (invoice.terms_and_conditions) {
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#17365D")
        .text("Terms and Conditions", 48, y);
      y += 14;
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#1F2937")
        .text(invoice.terms_and_conditions, 48, y, { width: rightEdge - 48 });
      y = doc.y + 10;
    }

    if (signaturePath && y < 700) {
      try {
        doc.image(signaturePath, rightEdge - 140, y, { fit: [130, 48] });
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#4B5563")
          .text("Authorized Signature", rightEdge - 140, y + 50, {
            width: 130,
            align: "center",
          });
      } catch (error) {
        console.warn("Could not add company signature to invoice PDF:", error.message);
      }
    }

    doc.end();
  });
}

module.exports = { createInvoicePdf };
