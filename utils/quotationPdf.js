const PDFDocument = require("pdfkit");

function formatMoney(value, currency) {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

function createQuotationPdf(quotation, company = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const rightEdge = doc.page.width - 48;
    const currency = quotation.currency || "LKR";
    const companyDetails = [
      company.company_address,
      company.contact_number,
      company.email_address,
    ].filter(Boolean);

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#17365D")
      .text(company.company_name || "Company", 48, 48, { width: 280 });
    doc.font("Helvetica").fontSize(9).fillColor("#4B5563");
    companyDetails.forEach((detail, index) => {
      doc.text(String(detail), 48, 74 + index * 13, { width: 280 });
    });

    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor("#17365D")
      .text("QUOTATION", 340, 48, { width: rightEdge - 340, align: "right" });
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#1F2937")
      .text(`Quotation No: ${quotation.quotation_number}`, 300, 82, {
        width: rightEdge - 300,
        align: "right",
      })
      .text(`Date: ${String(quotation.quotation_date).slice(0, 10)}`, 300, 98, {
        width: rightEdge - 300,
        align: "right",
      });
    if (quotation.valid_until) {
      doc.text(`Valid Until: ${String(quotation.valid_until).slice(0, 10)}`, 300, 114, {
        width: rightEdge - 300,
        align: "right",
      });
    }

    let y = 150;
    doc.moveTo(48, y).lineTo(rightEdge, y).lineWidth(1.5).stroke("#17365D");
    y += 18;
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#17365D").text("PREPARED FOR", 48, y);
    y += 17;
    doc.font("Helvetica").fontSize(10).fillColor("#1F2937");
    [
      quotation.customer_name,
      quotation.customer_company,
      quotation.customer_address,
      quotation.customer_email,
      quotation.customer_phone,
    ]
      .filter(Boolean)
      .forEach((detail) => {
        doc.text(String(detail), 48, y, { width: 280 });
        y += 14;
      });

    y = Math.max(y + 14, 240);
    const columns = { item: 55, description: 225, price: 400, tax: 460, total: 505 };
    doc.rect(48, y, rightEdge - 48, 24).fill("#17365D");
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF");
    doc.text("Item", columns.item + 7, y + 7);
    doc.text("Description", columns.description, y + 7);
    doc.text("Price", columns.price, y + 7, { width: 60, align: "right" });
    doc.text("Tax", columns.tax, y + 7, { width: 35, align: "right" });
    doc.text("Total", columns.total, y + 7, { width: 45, align: "right" });
    y += 24;

    doc.font("Helvetica").fontSize(9).fillColor("#1F2937");
    for (const [index, item] of (quotation.items || []).entries()) {
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
        width: 160,
      });
      doc.text(String(item.description || ""), columns.description, y + 8, {
        width: 165,
      });
      doc.text(formatMoney(item.unit_price ?? item.Price, currency), columns.price, y + 8, {
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
    const summaryRows = [
      ["Subtotal", quotation.subtotal],
      ["Discount", -Number(quotation.discount_amount || 0)],
      ["Tax", quotation.tax_amount],
      ["Total", quotation.total_amount],
    ];
    summaryRows.forEach(([label, amount]) => {
      if (y > 740) {
        doc.addPage();
        y = 55;
      }
      doc
        .font(label === "Total" ? "Helvetica-Bold" : "Helvetica")
        .fontSize(label === "Total" ? 11 : 9)
        .fillColor(label === "Total" ? "#17365D" : "#1F2937")
        .text(label, 380, y, { width: 100 });
      doc.text(formatMoney(Math.abs(Number(amount || 0)), currency), 485, y, {
        width: 100,
        align: "right",
      });
      y += 18;
    });

    if (quotation.notes || quotation.terms_and_conditions) {
      y += 12;
      if (y > 680) {
        doc.addPage();
        y = 55;
      }
    }

    if (quotation.notes) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#17365D").text("Notes", 48, y);
      y += 14;
      doc.font("Helvetica").fontSize(9).fillColor("#1F2937").text(quotation.notes, 48, y, {
        width: rightEdge - 48,
      });
      y = doc.y + 10;
    }

    if (quotation.terms_and_conditions) {
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
        .text(quotation.terms_and_conditions, 48, y, { width: rightEdge - 48 });
    }

    doc.end();
  });
}

module.exports = { createQuotationPdf };
