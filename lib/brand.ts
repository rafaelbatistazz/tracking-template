/**
 * Nome do produto. O template vem sem nome de proposito.
 *
 * Pra dar o seu: crie um .env.local com
 *   NEXT_PUBLIC_APP_NAME=Nome Do Seu App
 *
 * Sem isso, a barra lateral mostra so a marca grafica e o titulo da aba fica
 * generico. Nada quebra.
 */
export const APP_NAME = (process.env.NEXT_PUBLIC_APP_NAME || '').trim()

/** Titulo da aba do navegador. */
export const PAGE_TITLE = APP_NAME || 'Dashboard'
