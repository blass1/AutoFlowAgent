# Grafo de Page Objects

> Generado: 2026-05-13T15:50:48.815Z
> **4** pages · **3** conexiones

**Leyenda:** 🟦 inicio · 🟪 intermedia · 🟩 terminal

```mermaid
flowchart LR
    classDef inicio fill:#E3F2FD,stroke:#1565C0,stroke-width:2px,color:#0D47A1;
    classDef intermedia fill:#F3E5F5,stroke:#6A1B9A,stroke-width:1.5px,color:#4A148C;
    classDef terminal fill:#E8F5E9,stroke:#2E7D32,stroke-width:1.5px,color:#1B5E20;

    AddToCartMonitorPage([AddToCartMonitorPage]):::intermedia
    CartPage([CartPage]):::terminal
    LoginPage([LoginPage]):::inicio
    OverviewPage([OverviewPage]):::intermedia

    AddToCartMonitorPage ==> CartPage
    LoginPage ==> OverviewPage
    OverviewPage ==> AddToCartMonitorPage
```
