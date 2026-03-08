const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");
const bcrypt = require("bcrypt");
const ExcelJS = require("exceljs");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "inventario_secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(express.static(path.join(__dirname, "public")));

const db = new sqlite3.Database("./database.db");

//////////////////////////////////////////////
// CRIAÇÃO DAS TABELAS
//////////////////////////////////////////////

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS base_produtos (
      codigo TEXT PRIMARY KEY,
      descricao TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT,
      descricao TEXT,
      quantidade INTEGER,
      setor TEXT,
      user_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // garante coluna setor
  db.run(`ALTER TABLE produtos ADD COLUMN setor TEXT`, () => {});
});

//////////////////////////////////////////////
// MIDDLEWARE LOGIN
//////////////////////////////////////////////

function checkAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/login.html");
  }
  next();
}

//////////////////////////////////////////////
// CADASTRO
//////////////////////////////////////////////

app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  const hash = await bcrypt.hash(password, 10);

  db.run(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, hash],
    (err) => {
      if (err) {
        return res.send("Erro ao cadastrar usuário");
      }

      res.redirect("/login.html");
    }
  );
});

//////////////////////////////////////////////
// LOGIN
//////////////////////////////////////////////

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (!user) {
        return res.send("Usuário não encontrado");
      }

      const match = await bcrypt.compare(password, user.password);

      if (!match) {
        return res.send("Senha incorreta");
      }

      req.session.userId = user.id;

      res.redirect("/");
    }
  );
});

//////////////////////////////////////////////
// LOGOUT
//////////////////////////////////////////////

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login.html");
  });
});

//////////////////////////////////////////////
// BUSCAR PRODUTO NA BASE
//////////////////////////////////////////////

app.get("/api/buscar/:codigo", checkAuth, (req, res) => {
  const codigo = req.params.codigo;

  db.get(
    "SELECT descricao, setor FROM base_produtos WHERE codigo = ?",
    [codigo],
    (err, row) => {
      if (row) {
        res.json({
          encontrado: true,
          descricao: row.descricao,
          setor: row.setor || ""
        });
      } else {
        res.json({ encontrado: false });
      }
    }
  );
});

//////////////////////////////////////////////
// CADASTRAR PRODUTO
//////////////////////////////////////////////

app.post("/api/produtos", checkAuth, (req, res) => {
  const { codigo, descricao, quantidade, setor } = req.body;

  if (!codigo || !descricao || !quantidade) {
    return res.status(400).json({ error: "Preencha todos os campos" });
  }

  db.run(
    "INSERT INTO produtos (codigo, descricao, quantidade, setor, user_id) VALUES (?, ?, ?, ?, ?)",
    [codigo, descricao, quantidade, setor, req.session.userId],
    function (err) {
      if (err) {
        return res.status(500).json({ error: "Erro ao cadastrar produto" });
      }

      res.json({
        id: this.lastID,
        codigo,
        descricao,
        quantidade,
        setor,
      });
    }
  );
});

//////////////////////////////////////////////
// LISTAR PRODUTOS
//////////////////////////////////////////////

app.get("/api/produtos", checkAuth, (req, res) => {
  db.all(
    "SELECT * FROM produtos WHERE user_id = ? ORDER BY id DESC",
    [req.session.userId],
    (err, rows) => {
      res.json(rows);
    }
  );
});

//////////////////////////////////////////////
// EXCLUIR PRODUTO
//////////////////////////////////////////////

app.delete("/api/produtos/:id", checkAuth, (req, res) => {
  db.run(
    "DELETE FROM produtos WHERE id = ? AND user_id = ?",
    [req.params.id, req.session.userId],
    () => {
      res.json({ success: true });
    }
  );
});

//////////////////////////////////////////////
// EXPORTAR EXCEL
//////////////////////////////////////////////

app.get("/api/exportar", checkAuth, async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventario");

  sheet.columns = [
    { header: "Código", key: "codigo", width: 20 },
    { header: "Descrição", key: "descricao", width: 40 },
    { header: "Quantidade", key: "quantidade", width: 15 },
    { header: "Setor", key: "setor", width: 20 },
  ];

  db.all(
    "SELECT codigo, descricao, quantidade, setor FROM produtos WHERE user_id = ?",
    [req.session.userId],
    async (err, rows) => {
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

//////////////////////////////////////////////
// ANALYTICS RESUMO
//////////////////////////////////////////////

app.get("/api/analytics/resumo", checkAuth, (req, res) => {
  db.get(
    `
    SELECT 
      COUNT(DISTINCT codigo) as total_produtos,
      SUM(quantidade) as total_unidades
    FROM produtos
    WHERE user_id = ?
  `,
    [req.session.userId],
    (err, row) => {
      res.json(row);
    }
  );
});

//////////////////////////////////////////////
// ANALYTICS ÚLTIMOS 7 DIAS
//////////////////////////////////////////////

app.get("/api/analytics/top10", checkAuth, (req, res) => {
  db.all(
    `
    SELECT 
      descricao,
      SUM(quantidade) as total
    FROM produtos
    WHERE user_id = ?
    GROUP BY descricao
    ORDER BY total DESC
    LIMIT 10
    `,
    [req.session.userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: "Erro ao buscar top 10" });
      }
      res.json(rows);
    }
  );
});

app.get("/api/analytics/7dias", checkAuth, (req, res) => {
  db.all(
    `
    SELECT 
      date(created_at) as dia,
      SUM(quantidade) as total
    FROM produtos
    WHERE user_id = ?
    GROUP BY date(created_at)
    ORDER BY date(created_at)
  `,
    [req.session.userId],
    (err, rows) => {
      res.json(rows);
    }
  );
});

//////////////////////////////////////////////
// ANALYTICS POR SETOR
//////////////////////////////////////////////

app.get("/api/analytics/setores", checkAuth, (req, res) => {
  db.all(
    `
    SELECT 
      setor,
      COUNT(*) as total_produtos,
      SUM(quantidade) as total_unidades
    FROM produtos
    WHERE user_id = ?
    GROUP BY setor
    ORDER BY total_unidades DESC
  `,
    [req.session.userId],
    (err, rows) => {
      res.json(rows);
    }
  );
});

//////////////////////////////////////////////
// INICIAR SERVIDOR
//////////////////////////////////////////////

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});