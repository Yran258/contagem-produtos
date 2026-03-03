const sqlite3 = require("sqlite3").verbose();
const ExcelJS = require("exceljs");

async function importar() {
  const db = new sqlite3.Database("./database.db");

  // Garante que a tabela existe
  db.run(`
    CREATE TABLE IF NOT EXISTS base_produtos (
      codigo TEXT PRIMARY KEY,
      descricao TEXT
    )
  `);

  // 🔎 VERIFICA SE JÁ EXISTE DADO NA TABELA
  db.get("SELECT COUNT(*) AS total FROM base_produtos", [], async (err, row) => {

    if (!err && row && row.total > 0) {
      console.log("✅ Base já importada. Nada a fazer.");
      db.close();
      return;
    }

    console.log("📥 Iniciando importação da planilha...");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile("./base.xlsx");
    const sheet = workbook.worksheets[0];

    // Identificar colunas automaticamente
    const headerRow = sheet.getRow(1);
    let colDescricao = null;
    let colCodigo = null;

    headerRow.eachCell((cell, colNumber) => {
      const valor = String(cell.value || "").trim().toUpperCase();
      if (valor.includes("DESCRI")) colDescricao = colNumber;
      if (valor.includes("COD") && valor.includes("BARRAS")) colCodigo = colNumber;
    });

    if (!colDescricao || !colCodigo) {
      console.log("❌ Não encontrei as colunas corretas.");
      db.close();
      return;
    }

    const stmt = db.prepare(
      "INSERT OR REPLACE INTO base_produtos (codigo, descricao) VALUES (?, ?)"
    );

    let contador = 0;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // pula cabeçalho

      const descCell = row.getCell(colDescricao).value;
      const codCell = row.getCell(colCodigo).value;

      if (!descCell || !codCell) return;

      const descricao = String(descCell).trim();

      let codigo = "";
      if (typeof codCell === "number") {
        codigo = Math.trunc(codCell).toString();
      } else if (typeof codCell === "object" && codCell.text) {
        codigo = String(codCell.text).trim();
      } else {
        codigo = String(codCell).trim();
      }

      if (!codigo) return;

      stmt.run([codigo, descricao]);
      contador++;

      if (contador % 5000 === 0) {
        console.log(`Importados: ${contador}`);
      }
    });

    stmt.finalize(() => {
      console.log(`✅ Importação concluída. Total importado: ${contador}`);
      db.close();
    });

  });
}

importar().catch(err => {
  console.error("Erro na importação:", err);
});