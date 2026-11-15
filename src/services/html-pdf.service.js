import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { PDFDocument } from 'pdf-lib';
import { AppError } from '../utils/errors.js';
import { diagnosticError, diagnosticLog } from '../utils/diagnostic-log.js';

const execFileAsync = promisify(execFile);

const browserCandidates = {
  win32: [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ],
  linux: [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
};

export function resolvePdfBrowser(configuredPath = '') {
  if (configuredPath) {
    const path = resolve(configuredPath);
    if (!existsSync(path))
      throw new AppError(
        503,
        'NAVEGADOR_PDF_NO_DISPONIBLE',
        'PDF_BROWSER_PATH no apunta a un navegador Chromium disponible.',
      );
    return path;
  }
  const path = (browserCandidates[process.platform] || []).find((candidate) =>
    existsSync(candidate),
  );
  if (!path)
    throw new AppError(
      503,
      'NAVEGADOR_PDF_NO_DISPONIBLE',
      'Configure PDF_BROWSER_PATH con la ruta absoluta de Chrome, Chromium o Edge.',
    );
  return path;
}

/** Convierte HTML autocontenido a PDF sin JavaScript y con resolucion de red bloqueada. */
export function createHtmlPdfRenderer(config = {}, logger = console) {
  return async function render(view) {
    let executablePath;
    try {
      executablePath = resolvePdfBrowser(config.browserPath);
      diagnosticLog(logger, 'info', 'documentos.navegador_pdf_resuelto', {
        rutaNavegador: executablePath,
        rutaConfigurada: Boolean(config.browserPath),
        plataforma: process.platform,
      });
    } catch (error) {
      diagnosticLog(logger, 'error', 'documentos.navegador_pdf_error', {
        etapa: 'resolver_navegador',
        rutaNavegadorConfigurada: config.browserPath || null,
        plataforma: process.platform,
        ...diagnosticError(error),
      });
      throw error;
    }

    let temporaryDirectory;
    try {
      temporaryDirectory = await mkdtemp(join(tmpdir(), 'comprobantes-pdf-'));
    } catch (error) {
      diagnosticLog(logger, 'error', 'documentos.render_pdf_error', {
        etapa: 'crear_directorio_temporal',
        ...diagnosticError(error),
      });
      throw error;
    }
    const htmlPath = join(temporaryDirectory, 'comprobante.html');
    const pdfPath = join(temporaryDirectory, 'comprobante.pdf');
    const profilePath = join(temporaryDirectory, 'perfil-chromium');
    let stage = 'escribir_html_temporal';
    try {
      await writeFile(htmlPath, view.html, { encoding: 'utf8', flag: 'wx' });
      stage = 'ejecutar_chromium';
      await execFileAsync(
        executablePath,
        [
          '--headless=new',
          '--disable-background-networking',
          '--disable-component-update',
          '--disable-extensions',
          '--disable-gpu',
          '--disable-javascript',
          '--disable-sync',
          '--host-resolver-rules=MAP * ~NOTFOUND',
          '--no-default-browser-check',
          '--no-first-run',
          '--no-pdf-header-footer',
          `--user-data-dir=${profilePath}`,
          `--print-to-pdf=${pdfPath}`,
          ...(config.noSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
          pathToFileURL(htmlPath).href,
        ],
        {
          encoding: 'utf8',
          timeout: config.timeoutMs ?? 30000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
      );
      stage = 'leer_pdf_temporal';
      const rendered = await readFile(pdfPath);
      if (!rendered.subarray(0, 5).equals(Buffer.from('%PDF-')))
        throw new Error('Chromium no produjo un archivo PDF valido.');

      stage = 'normalizar_metadatos_pdf';
      const pdf = await PDFDocument.load(rendered);
      const issuedAt = new Date(view.issuedAt);
      pdf.setCreationDate(issuedAt);
      pdf.setModificationDate(issuedAt);
      pdf.setTitle(`${view.title} ${view.reference}`);
      pdf.setAuthor(view.issuer);
      pdf.setSubject(`Plantilla ${view.version}`);
      pdf.setCreator('Sistema de Comprobantes SERNANP');
      const content = Buffer.from(await pdf.save());
      diagnosticLog(logger, 'info', 'documentos.render_pdf_completado', {
        versionPlantilla: view.version,
        bytes: content.length,
      });
      return content;
    } catch (error) {
      diagnosticLog(logger, 'error', 'documentos.render_pdf_error', {
        etapa: stage,
        rutaNavegador: executablePath,
        ...diagnosticError(error),
      });
      if (error instanceof AppError) throw error;
      throw new AppError(
        503,
        'ERROR_RENDER_PDF',
        `No se pudo generar la representación PDF: ${error.message}`,
      );
    } finally {
      try {
        await rm(temporaryDirectory, { recursive: true, force: true });
      } catch (error) {
        diagnosticLog(logger, 'error', 'documentos.render_pdf_error', {
          etapa: 'limpiar_directorio_temporal',
          ...diagnosticError(error),
        });
        throw error;
      }
    }
  };
}
