# Grafo de Nodos

> Generado: 2026-05-13T15:54:23.247Z
> **16** nodos · **8** intra-page · **3** inter-page · **3** asserts

**Confiabilidad del locator:**
🟩 5 = id/testid · 🟢 4 = role+name · 🟡 3 = label · 🟧 2 = placeholder/text · 🟥 1 = CSS/posicional · ⬜ N/A (goto, assert) · 🟪 capturar · 🟦 verificar

**Aristas:** finas `-->` intra-page · gruesas `==>` inter-page (`conecta`) · punteadas `-.assert.->` desde el último nodo de la page hacia cada assert.

```mermaid
flowchart TB
    classDef conf5 fill:#1B5E20,stroke:#0D3311,color:#FFFFFF;
    classDef conf4 fill:#A5D6A7,stroke:#2E7D32,color:#0D3311;
    classDef conf3 fill:#FFF59D,stroke:#F9A825,color:#5D4037;
    classDef conf2 fill:#FFCC80,stroke:#EF6C00,color:#3E2723;
    classDef conf1 fill:#EF9A9A,stroke:#C62828,color:#3E0000;
    classDef confNa fill:#ECEFF1,stroke:#607D8B,color:#263238;
    classDef confCap fill:#E1BEE7,stroke:#6A1B9A,color:#4A148C;
    classDef confVer fill:#B2EBF2,stroke:#00838F,color:#006064;

    subgraph AddToCartMonitorPage["AddToCartMonitorPage"]
        direction LR
        N3["toBeVisible\nApple monitor"]:::confNa
        N1["click\nApple monitor"]:::conf4
        N4["toBeVisible\nApple monitor"]:::confNa
        N2["click\nAdd to cart"]:::conf4
    end

    subgraph CartPage["CartPage"]
        direction LR
        N5["click\nCart"]:::conf4
        N16["toBeVisible\nimg"]:::confNa
        N6["toBeVisible\nimg&gt;&gt;first"]:::confNa
    end

    subgraph LoginPage["LoginPage"]
        direction LR
        N7["goto demoblaze.com/"]:::confNa
        N8["click\nLog in"]:::conf4
        N9["click\n#loginusername"]:::conf2
        N10["fill\n#loginusername"]:::conf2
        N11["click\n#loginpassword"]:::conf2
        N12["fill\n#loginpassword"]:::conf2
        N13["click\nLog in"]:::conf4
        N14["capturar-screen\npage"]:::confNa
    end

    subgraph OverviewPage["OverviewPage"]
        direction LR
        N15["click\nMonitors"]:::conf4
    end

    N1 --> N2
    N7 --> N8
    N8 --> N9
    N9 --> N10
    N10 --> N11
    N11 --> N12
    N12 --> N13
    N13 --> N14
    N2 ==> N5
    N14 ==> N15
    N15 ==> N1
    N2 -.assert.-> N3
    N2 -.assert.-> N4
    N5 -.assert.-> N6
```
