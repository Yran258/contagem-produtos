/**
 * acessibilidade.js
 * Gerencia o tamanho da fonte e o tema (Claro/Escuro) do sistema EstoquePro.
 */

// ==========================================
// 1. Inicialização de Preferências
// ==========================================

// Recupera as preferências salvas no localStorage ou define os padrões
let tamanhoFonte = parseInt(localStorage.getItem('fonte')) || 16;
const temaSalvo = localStorage.getItem('tema') || 'light';

// Aplica as preferências assim que o script é carregado
document.documentElement.style.setProperty('--base-font-size', tamanhoFonte + 'px');
document.documentElement.setAttribute('data-theme', temaSalvo);

// ==========================================
// 2. Lógica de Tamanho de Fonte
// ==========================================

function mudarFonte(delta) {
  // Define limites: mínimo 12px, máximo 24px para não quebrar o layout
  tamanhoFonte = Math.min(Math.max(tamanhoFonte + (delta * 2), 12), 24);
  
  // Aplica a mudança na variável CSS raiz
  document.documentElement.style.setProperty('--base-font-size', tamanhoFonte + 'px');
  
  // Salva a preferência
  localStorage.setItem('fonte', tamanhoFonte);
}

// ==========================================
// 3. Lógica de Tema (Claro/Escuro)
// ==========================================

function toggleTema() {
  const html = document.documentElement;
  const temaAtual = html.getAttribute('data-theme');
  const novoTema = temaAtual === 'dark' ? 'light' : 'dark';
  
  // 1. Aplica o novo tema ao atributo data-theme
  // Isso faz com que as variáveis no seu style.css mudem automaticamente
  html.setAttribute('data-theme', novoTema);
  
  // 2. Salva a preferência
  localStorage.setItem('tema', novoTema);
  
  // 3. Atualiza o ícone do botão visualmente
  atualizarIconeTema(novoTema);

  /**
   * 4. Notificação de Mudança de Tema
   * Dispara um evento personalizado para que outros componentes (como o Chart.js)
   * saibam que as cores mudaram e precisam ser redesenhadas.
   */
  window.dispatchEvent(new Event('temaAlterado'));
}

function atualizarIconeTema(tema) {
  const icone = document.getElementById('icone-tema');
  if (icone) {
    // Alterna entre os ícones da Lua e do Sol do Bootstrap Icons
    icone.className = tema === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars';
  }
}

// ==========================================
// 4. Configuração Inicial ao Carregar o DOM
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
  // Garante que o ícone do tema esteja correto na carga da página
  atualizarIconeTema(localStorage.getItem('tema') || 'light');
  
  // Se houver tabelas complexas que precisam de ajuste via JS, 
  // você pode adicionar lógica extra aqui.
});