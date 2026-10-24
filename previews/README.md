# Imagens de pré-visualização do link (Facebook / WhatsApp / X)

Todas em 1200×630. **Em uso hoje:** `/og-familia.jpg` (na raiz do site).

| Arquivo | Descrição |
|---|---|
| `og-aeroporto.jpg` | Mãe no celular, família no aeroporto |
| `og-piscina.jpg` | Pai no celular, família na piscina |
| `og-hitech.png` | Escudo SF com visual hi-tech (circuitos, gráfico) |
| `og-ilustracao-futurista.png` | Ilustração: família no celular numa cidade neon |

## Como trocar
1. Copie a imagem escolhida para a raiz com um **nome novo** (o Facebook guarda a imagem antiga pelo nome/URL), ex.: `cp previews/og-piscina.jpg og-piscina-2.jpg`.
2. No `index.html`, troque o endereço nas linhas `og:image` e `twitter:image` (e `og:image:type`: `image/jpeg` ou `image/png`).
3. Publique, espere ~2 min e use o Depurador de Compartilhamento do Facebook → **Coletar novamente**.
