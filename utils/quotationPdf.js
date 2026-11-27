const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

function formatMoney(value, currency) {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

// Treat stored upload values as filenames and reject paths outside the upload folder.
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

function createQuotationPdf(quotation, company = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const rightEdge = doc.page.width - 48;
    const currency = quotation.currency || "LKR";
    const logoPath = resolveUploadedImage(company.company_logo);
    const signaturePath = resolveUploadedImage(company.company_signature);
    const companyX = logoPath ? 122 : 48;
    const companyWidth = logoPath ? 230 : 280;
    const companyDetails = [
      company.company_address,
      company.contact_number,
      company.email_address,
    ].filter(Boolean);

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#17365D")
      .text(company.company_name || "Company", companyX, 48, {
        width: companyWidth,
      });
    if (logoPath) {
      try {
        doc.image(logoPath, 48, 42, { fit: [64, 54] });
      } catch (error) {
        console.warn("Could not add company logo to quotation PDF:", error.message);
      }
    }
    doc.font("Helvetica").fontSize(9).fillColor("#4B5563");
    companyDetails.forEach((detail, index) => {
      doc.text(String(detail), companyX, 74 + index * 13, {
        width: companyWidth,
      });
    });

    const heading = company.pdf_heading || "QUOTATION";
    const headingWidth = rightEdge - 300;
    doc.font("Helvetica-Bold").fontSize(22);
    const headingFontSize = Math.min(
      22,
      (22 * headingWidth) / doc.widthOfString(heading)
    );
    doc
      .font("Helvetica-Bold")
      .fontSize(headingFontSize)
      .fillColor("#17365D")
      .text(heading, 300, 48, {
        width: headingWidth,
        align: "right",
        lineBreak: false,
      });
    if (company.pdf_subheading) {
      const subheading = String(company.pdf_subheading);
      const subheadingWidth = rightEdge - 300;
      doc.font("Helvetica").fontSize(9);
      const subheadingFontSize = Math.min(
        9,
        (9 * subheadingWidth) / doc.widthOfString(subheading)
      );
      doc
        .font("Helvetica")
        .fontSize(subheadingFontSize)
        .fillColor("#4B5563")
        .text(subheading, 300, 75, {
          width: subheadingWidth,
          align: "right",
          lineBreak: false,
        });
    }
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#1F2937")
      .text(`Quotation No: ${quotation.quotation_number}`, 300, 91, {
        width: rightEdge - 300,
        align: "right",
      })
      .text(`Date: ${String(quotation.quotation_date).slice(0, 10)}`, 300, 107, {
        width: rightEdge - 300,
        align: "right",
      });
    if (quotation.valid_until) {
      doc.text(
        `Valid Until: ${String(quotation.valid_until).slice(0, 10)}`,
        300,
        123,
        {
          width: rightEdge - 300,
          align: "right",
        }
      );
    }

    let y = 160;
    if (company.pdf_custom_lines) {
      const customLines = String(company.pdf_custom_lines)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (customLines.length > 0) {
        y = Math.max(y, 140 + (customLines.length - 1) * 12);
        doc.font("Helvetica").fontSize(9).fillColor("#4B5563");
        customLines.forEach((line, index) => {
          doc.text(line, 48, 140 + index * 12, { width: rightEdge - 48 });
        });
        y += 12;
      }
    }
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
    // Start a new page before drawing a line item in the footer area.
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
      doc.text(
        item.price_text ||
          item.unit_price_text ||
          formatMoney(item.unit_price ?? item.Price, currency),
        columns.price,
        y + 8,
        { width: 60, align: "right" }
      );
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

    const customSections = Array.isArray(company.pdf_custom_sections)
      ? company.pdf_custom_sections
      : [];
    for (const section of customSections) {
      const heading = String(section?.heading || "").trim();
      const body = String(section?.sub_text || "").trim();
      if (!heading && !body) continue;

      y += 10;
      if (y > 690) {
        doc.addPage();
        y = 55;
      }
      if (heading) {
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor("#17365D")
          .text(heading, 48, y, { width: rightEdge - 48 });
        y = doc.y + 4;
      }
      if (body) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#1F2937")
          .text(body, 48, y, { width: rightEdge - 48 });
        y = doc.y + 6;
      }
    }

    const terms =
      quotation.terms_and_conditions ||
      company.default_terms_and_conditions ||
      "";
    if (
      quotation.notes ||
      terms ||
      company.pdf_footer_note ||
      company.quotation_thank_you_message
    ) {
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

    if (terms) {
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
        .text(terms, 48, y, { width: rightEdge - 48 });
      y = doc.y + 10;
    }

    for (const [label, value, bold] of [
      ["", company.pdf_footer_note, false],
      [company.quotation_thank_you_title || "Thank You", company.quotation_thank_you_message, true],
      ["Prepared By", company.quotation_prepared_by, true],
      ["", company.quotation_prepared_by_services, false],
      ["", company.quotation_ceo_name, true],
      ["", company.quotation_ceo_designation, false],
    ]) {
      if (!label && !value) continue;
      if (y > 690) {
        doc.addPage();
        y = 55;
      }
      if (label) {
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor("#17365D")
          .text(label, 48, y, { width: rightEdge - 48 });
        y = doc.y + 4;
      }
      if (value) {
        doc
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(9)
          .fillColor("#1F2937")
          .text(String(value), 48, y, { width: rightEdge - 48 });
        y = doc.y + 6;
      }
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
        console.warn(
          "Could not add company signature to quotation PDF:",
          error.message
        );
      }
    }

    doc.end();
  });
}

module.exports = { createQuotationPdf };
