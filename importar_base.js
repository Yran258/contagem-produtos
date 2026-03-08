const sqlite3 = require("sqlite3").verbose();
const ExcelJS = require("exceljs");

async function importar() {
  const db = new sqlite3.Database("./database.db");

  // Garante que a tabela existe
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS base_produtos (
        codigo TEXT PRIMARY KEY,
        descricao TEXT,
        setor TEXT
      )
    `);

    // Garante a coluna setor em bases antigas
    db.run(`ALTER TABLE base_produtos ADD COLUMN setor TEXT`, () => {
      // ignora erro se a coluna já existir
    });
  });

  console.log("📥 Iniciando importação da planilha...");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile("./base.xlsx");
  const sheet = workbook.worksheets[0];

  // Identificar colunas automaticamente
  const headerRow = sheet.getRow(1);
  let colDescricao = null;
  let colCodigo = null;
  let colSetor = null;

  headerRow.eachCell((cell, colNumber) => {
    const valor = String(cell.value || "").trim().toUpperCase();

    if (valor.includes("DESCRI")) colDescricao = colNumber;
    if (valor.includes("COD") && valor.includes("BARRAS")) colCodigo = colNumber;
    if (valor === "SETOR") colSetor = colNumber;
  });

  if (!colDescricao || !colCodigo || !colSetor) {
    console.log("❌ Não encontrei as colunas corretas.");
    console.log("Verifique se a planilha possui: DESCRIÇÃO, COD. BARRAS e SETOR.");
    db.close();
    return;
  }

  const stmt = db.prepare(
    "INSERT OR REPLACE INTO base_produtos (codigo, descricao, setor) VALUES (?, ?, ?)"
  );

  let contador = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // pula cabeçalho

    const descCell = row.getCell(colDescricao).value;
    const codCell = row.getCell(colCodigo).value;
    const setorCell = row.getCell(colSetor).value;

    if (!descCell || !codCell) return;

    const descricao = String(descCell).trim();
    const setor = setorCell ? String(setorCell).trim() : "";

    let codigo = "";
    if (typeof codCell === "number") {
      codigo = Math.trunc(codCell).toString();
    } else if (typeof codCell === "object" && codCell.text) {
      codigo = String(codCell.text).trim();
    } else {
      codigo = String(codCell).trim();
    }

    if (!codigo) return;

    stmt.run([codigo, descricao, setor]);
    contador++;

    if (contador % 5000 === 0) {
      console.log(`Importados: ${contador}`);
    }
  });

  stmt.finalize(() => {
    console.log(`✅ Importação concluída. Total importado: ${contador}`);
    db.close();
  });
}

importar().catch(err => {
  console.error("Erro na importação:", err);
});