# Fundação PWA 0025a

Esta etapa torna o cliente web instalável e prepara seu funcionamento offline.
Ela não altera o runtime espacial nem introduz uma segunda via de comandos.

## Escopo

- manifesto instalável com ícones de 192 e 512 pixels;
- service worker em `apps/web`, com controle limitado à aplicação e cache dos
  recursos compartilhados em `packages` e `vendor`;
- cache versionado pelo `build-info.json`, sem versão duplicada no HTML;
- consulta de versão pela rede primeiro, para que um cache antigo não impeça
  a descoberta de uma atualização;
- registro não bloqueante: uma falha no modo offline não impede o editor de abrir;
- manifesto de precache determinístico e verificável.

## Atualizar o conjunto offline

Quando um módulo estático for criado, removido ou renomeado, execute:

```sh
python3 tools/generate_pwa_precache.py
python3 tools/generate_pwa_precache.py --check
```

O primeiro acesso ainda requer rede. Depois que o service worker concluir a
instalação, os módulos do aplicativo ficam disponíveis no cache do navegador.
A atualização entra em vigor com segurança quando as abas da versão anterior
forem encerradas.

O arquivo `service-worker.js` da raiz é apenas uma ponte de migração: instalações
da 0025 anteriores ao escopo restrito o recebem, removem o registro amplo e passam
a usar `apps/web/service-worker.js`. Ele não intercepta requisições nem mantém um
segundo cache.

## Diagnóstico no navegador

Após a inicialização, `window.__SPATIAL_SEED_PWA__` informa se o recurso é
suportado, se o registro foi concluído, o escopo controlado, builds ativo,
controlador e aguardando, além de eventual erro. Se o manifesto publicado for
mais novo que o cache que controla a página, o rodapé mostra explicitamente
`cache … · feche para atualizar`.

O menu **Projeto** oferece a ação de instalação. Em navegadores Chromium ela
usa o prompt nativo quando o navegador declara a aplicação elegível; em outros
contextos, mostra o caminho pelo menu do navegador. Quando executado em modo
standalone, o controle informa que o aplicativo já está instalado.

Service workers exigem HTTPS, exceto em origens locais como
`http://127.0.0.1`. O servidor de desenvolvimento continua útil porque módulos
ES, import maps e service workers dependem das regras de uma origem HTTP.
