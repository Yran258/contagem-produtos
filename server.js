// ===============================
// IMPORTAÇÕES
// ===============================
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");
const ExcelJS = require("exceljs"); // <-- ADICIONADO

const app = express();


// ===============================
// MIDDLEWARES
// ===============================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: "segredo_super_secreto",
  resave: false,
  saveUninitialized: false
}));

app.use(express.static("public"));


// ===============================
// BANCO DE DADOS
// ===============================
const db = new sqlite3.Database("./database.db");

db.serialize(() => {

  // TABELA BASE (importada da planilha)
db.run(`
  CREATE TABLE IF NOT EXISTS base_produtos (
    codigo TEXT PRIMARY KEY,
    descricao TEXT
  )
`);
  
  
  // TABELA USUÁRIOS
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);

  // TABELA PRODUTOS
  db.run(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT,
      descricao TEXT,
      quantidade INTEGER,
      user_id INTEGER
    )
  `);

});


// ===============================
// PROTEÇÃO
// ===============================
function checkAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Não autorizado" });
  }
  next();
}


// ===============================
// CADASTRO
// ===============================
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.send("Preencha todos os campos");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  db.run(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, hashedPassword],
    function (err) {
      if (err) {
        return res.send("Usuário já existe");
      }
      res.redirect("/login.html");
    }
  );
});


// ===============================
// LOGIN
// ===============================
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {

      if (!user) {
        return res.send("Usuário não encontrado");
      }

      const valid = await bcrypt.compare(password, user.password);

      if (!valid) {
        return res.send("Senha incorreta");
      }

      req.session.userId = user.id;
      res.redirect("/");
    }
  );
});


// ===============================
// ROTA PRINCIPAL
// ===============================
app.get("/", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login.html");
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


// ===============================
// API PRODUTOS
// ===============================

// LISTAR
app.get("/api/produtos", checkAuth, (req, res) => {
  db.all(
    "SELECT * FROM produtos WHERE user_id = ?",
    [req.session.userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: "Erro ao buscar produtos" });
      }
      res.json(rows);
    }
  );
});

// CADASTRAR
app.post("/api/produtos", checkAuth, (req, res) => {
  const { codigo, descricao, quantidade } = req.body;

  if (!codigo || !descricao || !quantidade) {
    return res.status(400).json({ error: "Preencha todos os campos" });
  }

  db.run(
    "INSERT INTO produtos (codigo, descricao, quantidade, user_id) VALUES (?, ?, ?, ?)",
    [codigo, descricao, quantidade, req.session.userId],
    function (err) {
      if (err) {
        return res.status(500).json({ error: "Erro ao cadastrar produto" });
      }

      res.json({
        id: this.lastID,
        codigo,
        descricao,
        quantidade
      });
    }
  );
});

// EXCLUIR
app.delete("/api/produtos/:id", checkAuth, (req, res) => {
  const { id } = req.params;

  db.run(
    "DELETE FROM produtos WHERE id = ? AND user_id = ?",
    [id, req.session.userId],
    function (err) {
      if (err) {
        return res.status(500).json({ error: "Erro ao excluir" });
      }

      res.json({ success: true });
    }
  );
});


// ===============================
// EXPORTAR EXCEL (ADICIONADO)
// ===============================
app.get("/api/exportar", checkAuth, async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventario");

  sheet.columns = [
    { header: "Código", key: "codigo", width: 20 },
    { header: "Descrição", key: "descricao", width: 40 },
    { header: "Quantidade", key: "quantidade", width: 15 }
  ];

  db.all(
    "SELECT codigo, descricao, quantidade FROM produtos WHERE user_id = ?",
    [req.session.userId],
    async (err, rows) => {
      if (err) {
        return res.status(500).json({ error: "Erro ao exportar" });
      }

      rows.forEach((row) => sheet.addRow(row));

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="inventario.xlsx"'
      );

      await workbook.xlsx.write(res);
      res.end();
    }
  );
});

// BUSCAR DESCRIÇÃO PELO CÓDIGO
app.get("/api/buscar/:codigo", checkAuth, (req, res) => {
  const codigo = req.params.codigo;

  db.get(
    "SELECT descricao FROM base_produtos WHERE codigo = ?",
    [codigo],
    (err, row) => {
      if (err) return res.status(500).json({ error: "Erro ao buscar" });
      if (!row) return res.json({ encontrado: false });

      res.json({ encontrado: true, descricao: row.descricao });
    }
  );
});

// ===============================
// LOGOUT
// ===============================
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login.html");
  });
});


// ===============================
// INICIAR SERVIDOR
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});