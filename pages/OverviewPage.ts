import { type Page, type Locator } from '@playwright/test';
import { bufferEntreAcciones } from '../fixtures';

/** Catálogo principal post-login en Demon blaze. */
export default class OverviewPage {
  private readonly page: Page;
  private readonly linkMonitores: Locator;

  constructor(page: Page) {
    this.page = page;
    this.linkMonitores = page.getByRole('link', { name: 'Monitors' });
  }

  /** Filtra el catálogo por la categoría Monitors. */
  async seleccionarMonitores(): Promise<void> {
    await this.linkMonitores.click();
    await bufferEntreAcciones(this.page);
  }
}
