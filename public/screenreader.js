class ScreenReaderNavigator {
    constructor() {
        this.readableElements = [];
        this.currentIndex = -1;
        this.highlightClass = 'screen-reader-highlight';
        this.isEditMode = false;
        this.isPlayingAudio = false;

        // controla se é o primeiro toque daquela página
        this.isFirstKeystroke = true;
        this.apibaseurl = "http://localhost:8000";

        this.init();
    }

    init() {
        const style = document.createElement('style');
        style.textContent = `
            .${this.highlightClass} {
                outline: 3px solid #ff9800 !important;
                outline-offset: 4px !important;
                border-radius: 2px;
                transition: outline 0.1s ease-in-out;
                background-color: rgba(255, 152, 0, 0.1) !important;
            }
            /* NOVO: Classe para esconder texto visualmente, mas manter no DOM */
            .sr-only {
                position: absolute;
                width: 1px;
                height: 1px;
                padding: 0;
                margin: -1px;
                overflow: hidden;
                clip: rect(0, 0, 0, 0);
                white-space: nowrap;
                border: 0;
            }
        `;
        document.head.appendChild(style);

        //Injeta as instruções no topo do body para os leitores de tela nativos (NVDA/VoiceOver)
        this.injectNativeInstructions();

        this.processCanvases();
        this.updateReadableElements();
        this.observeDOMChanges();

        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    // Função que cria o bloco invisível
    injectNativeInstructions() {
        const instructionDiv = document.createElement('div');
        instructionDiv.className = 'sr-only';
        // O atributo aria-live="polite" faz o leitor nativo ler isso assim que carregar
        instructionDiv.setAttribute('aria-live', 'polite');
        instructionDiv.innerText = "Bem-vindo ao EstoquePro. Este site possui um sistema de navegação e leitura integrado. Pressione qualquer seta do teclado para iniciar a navegação. Pressione a letra H a qualquer momento para ouvir os comandos de ajuda.";

        // Insere como o primeiro elemento do body
        document.body.insertBefore(instructionDiv, document.body.firstChild);
    }

    handleKeyDown(event) {
        const navigationKeys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Enter', 'h', 'H'];

        if (this.isPlayingAudio && navigationKeys.includes(event.key)) {
            event.preventDefault();
            return;
        }

        const currentElement = this.currentIndex >= 0 && this.currentIndex < this.readableElements.length
            ? this.readableElements[this.currentIndex]
            : null;

        if (this.isEditMode) {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.isEditMode = false;
                if (currentElement) currentElement.blur();
                this.sendToAudioAPI("Modo de navegação. Edição concluída.");
            }
            return;
        }

        if (event.key === 'h' || event.key === 'H') {
            event.preventDefault();
            this.sendToAudioAPI("Ajuda do sistema: Use as setas para cima ou para baixo para navegar entre os elementos. Pressione enter para editar campos ou acionar botões. Pressione Esc para sair do modo de edição. Pressione H para repetir esta mensagem.");
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
            event.preventDefault();
            // Se for a primeira interação, ele toca o áudio e encerra a função
            if (this.handleFirstInteraction()) return;

            this.navigate(1);
        }
        else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
            event.preventDefault();
            // Mesma trava aqui
            if (this.handleFirstInteraction()) return;

            this.navigate(-1);
        }
        else if (event.key === 'Enter' && currentElement) {
            event.preventDefault();

            if (this.isInteractiveInput(currentElement)) {
                this.isEditMode = true;
                currentElement.focus();
                this.sendToAudioAPI("Modo de edição ativado. Pressione esc para sair.");
            }
            else if (currentElement.tagName === 'BUTTON' || currentElement.tagName === 'A') {
                const nomeDoElemento = this.extractText(currentElement);

                if (currentElement.tagName === 'A' && currentElement.hasAttribute('href')) {
                    const href = currentElement.getAttribute('href');
                    if (href !== '#' && !href.startsWith('javascript:')) {
                        this.sendToAudioAPI(`Navegando para: ${nomeDoElemento}`, currentElement, () => {
                            window.location.href = href;
                        });
                        return;
                    }
                }

                currentElement.click();
                this.sendToAudioAPI(`Acionado: ${nomeDoElemento}`, currentElement);
            }
        }
    }

    //Lida com a primeira ação do usuário
    handleFirstInteraction() {
        // Se o usuário já deu o primeiro toque nesta página, sai imediatamente
        if (!this.isFirstKeystroke) return false;

        // Marca que a primeira tecla desta página acabou de ser pressionada
        this.isFirstKeystroke = false;

        // Consulta a memória do navegador para saber se é um visitante novo
        const jaVisitouOSite = localStorage.getItem('leitorEstoqueProAtivado');

        if (!jaVisitouOSite) {
            // É o primeiro acesso no site
            // Grava a marcação para evitar que o audio de instrução toque novamente
            localStorage.setItem('leitorEstoqueProAtivado', 'true');

            // Toca a instrução inicial
            this.sendToAudioAPI("Leitor interno ativado. Pressione as setas novamente para começar. Pressione a tecla 'H' para mais informações.");

            // Trava a navegação até que o audio complete
            return true;
        }

        // Se não for a primeira visita, retorna falso em silêncio.
        // O código vai prosseguir normalmente e ler o primeiro item da tela
        return false;
    }

    updateReadableElements() {
        const selectors = 'h1, h2, h3, h4, h5, h6, p, span, a, button, input, textarea, select, img[alt], [aria-label], th, td';

        // Pega todos os candidatos válidos
        let candidates = Array.from(document.querySelectorAll(selectors)).filter(el => {

            // Ignora o elemento se ele ou qualquer "pai" dele tiver a classe IgnoreReader
            if (el.closest('.IgnoreReader')) {
                return false;
            }

            const hasDimensions = el.offsetWidth > 0 && el.offsetHeight > 0;
            const hasText = this.extractText(el).trim().length > 0;

            if (el.tagName === 'CANVAS' && !el.hasAttribute('aria-label')) {
                return false;
            }

            return hasDimensions && hasText;
        });

        // Filtra duplicatas aninhadas para evitar ler duas vezes
        this.readableElements = candidates.filter(el => {
            const isInteractive = this.isInteractiveInput(el) || el.tagName === 'BUTTON' || el.tagName === 'A';

            const parentInList = candidates.find(parent => parent !== el && parent.contains(el));

            if (parentInList) {
                if (!isInteractive) {
                    return false;
                }
            }

            const childInList = candidates.find(child => child !== el && el.contains(child));

            if (childInList) {
                if (this.extractText(el).trim() === this.extractText(childInList).trim()) {
                    const childIsInteractive = this.isInteractiveInput(childInList) || childInList.tagName === 'BUTTON' || childInList.tagName === 'A';

                    if (childIsInteractive) {
                        return false;
                    }
                }
            }

            return true;
        });
    }

    async processCanvases() {
        const canvases = document.querySelectorAll('canvas:not([data-grafico-processado="true"])');

        for (let canvas of canvases) {
            const rawData = canvas.textContent || canvas.innerText;

            // Se os dados ainda não chegaram, ignoramos por enquanto.
            // IMPORTANTE: Não marcar como processado. 
            // Assim, quando o outro script inserir dados, o MutationObserver vai rodar de novo e tentar novamente.
            if (!rawData || rawData.trim() === '') {
                continue;
            }

            // Com os dados recebidos. Carimbamos o canvas para não chamar a API duas vezes.
            canvas.setAttribute('data-grafico-processado', 'true');

            try {
                console.log("Dados capturados com sucesso. Enviando para a API de processamento:", rawData.substring(0, 50) + "...");

                const response = await fetch(`${this.apibaseurl}/api/v1/textmodel/sumarise`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: rawData })
                });

                const textoFormatado = await response.text();

                if (textoFormatado) {
                    canvas.setAttribute('aria-label', textoFormatado);
                    canvas.tabIndex = 0;

                    this.updateReadableElements();
                    console.log("Aria-label injetado no canvas.");
                }
            } catch (error) {
                console.error('Erro ao processar dados do canvas:', error);
                canvas.setAttribute('aria-label', 'Gráfico com dados indisponíveis no momento.');
                this.updateReadableElements();
            }
        }
    }

    observeDOMChanges() {
        const observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;

            for (let mutation of mutations) {
                if (mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
                    shouldUpdate = true;
                    break;
                }
            }

            if (shouldUpdate) {
                // Se novos elementos entrarem no DOM, verificar se há novos canvas para processar
                this.processCanvases();
                this.updateReadableElements();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    extractText(element) {
        if (element.hasAttribute('aria-label')) return element.getAttribute('aria-label');
        if (element.tagName === 'IMG') return element.alt || '';
        if (this.isInteractiveInput(element)) {
            return element.value || element.placeholder || 'Campo de entrada de texto';
        }
        return element.innerText || element.textContent || '';
    }

    isInteractiveInput(element) {
        return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT';
    }

    navigate(direction) {
        if (this.readableElements.length === 0) return;

        if (this.currentIndex >= 0 && this.currentIndex < this.readableElements.length) {
            this.readableElements[this.currentIndex].classList.remove(this.highlightClass);
        }

        this.currentIndex += direction;

        if (this.currentIndex >= this.readableElements.length) {
            this.currentIndex = 0;
        } else if (this.currentIndex < 0) {
            this.currentIndex = this.readableElements.length - 1;
        }

        const currentElement = this.readableElements[this.currentIndex];

        if (!document.body.contains(currentElement)) {
            this.updateReadableElements();
            this.currentIndex = 0;
            return;
        }

        currentElement.classList.add(this.highlightClass);
        currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        let textToRead = this.extractText(currentElement);

        if (this.isInteractiveInput(currentElement)) {
            textToRead += ". Pressione enter para digitar.";
        } else if (currentElement.tagName === 'BUTTON' || currentElement.tagName === 'A') {
            textToRead += ". Pressione enter para acionar.";
        }

        this.sendToAudioAPI(textToRead, currentElement);
    }

    sendToAudioAPI(text, sourceElement, onComplete = null) {
        console.log(`Enviando para a API de Áudio: "${text}"`);
        this.isPlayingAudio = true;

        // Verifica se a leitura vem de um canvas
        const isFromCanvas = sourceElement && sourceElement.tagName === 'CANVAS';
        const isIgnoreCache = sourceElement && sourceElement.classList.contains("isIgnoreCache");

        fetch(`${this.apibaseurl}/api/v1/speechmodel/text2speech`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                texto: text,
                lang: "p",
                do_not_cache: isFromCanvas || isIgnoreCache
            })
        })
            .then(response => response.blob())
            .then(audioBlob => {
                const audioUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioUrl);

                audio.addEventListener('ended', () => {
                    this.isPlayingAudio = false;
                    URL.revokeObjectURL(audioUrl);

                    // NOVO: Executa a navegação de página, se existir
                    if (onComplete) onComplete();
                });

                // Failsafe: Se o áudio falhar ao carregar, navega mesmo assim para não prender o usuário
                audio.addEventListener('error', () => {
                    console.error("Erro na reprodução nativa do áudio.");
                    this.isPlayingAudio = false;
                    if (onComplete) onComplete();
                });

                audio.play();
            })
            .catch(error => {
                console.error('Erro na requisição da API de Áudio:', error);
                this.isPlayingAudio = false;

                // Failsafe: Se a API cair ou estiver offline, navega mesmo assim
                if (onComplete) onComplete();
            });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const screenReader = new ScreenReaderNavigator();
});