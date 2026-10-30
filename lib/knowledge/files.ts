import { KNOWLEDGE_LIMIT } from './safety';
export async function extractFile(file: File): Promise<string> {
  if(file.size>2*1024*1024)throw Error('Keep files below 2 MB. Split large documents into smaller sections.');
  const extension=file.name.split('.').pop()?.toLowerCase();
  if(!['pdf','txt','md'].includes(extension??''))throw Error('Choose a PDF, Markdown (.md), or text (.txt) file.');
  const data=new Uint8Array(await file.arrayBuffer());
  if(extension!=='pdf') {
    let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{throw Error('Use a UTF-8 text or Markdown file.');}
    if(text.length>KNOWLEDGE_LIMIT)throw Error('Keep document text below 50,000 characters.');return text;
  }
  if(new TextDecoder().decode(data.slice(0,5))!=='%PDF-')throw Error('This file does not have a valid PDF signature.');
  const pdfjs=await import('pdfjs-dist');
  const {default:workerUrl}=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  // No PDF viewer, scripting layer, rendering, annotations or external resources.
  pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
  const options={data,isEvalSupported:false,useWorkerFetch:false,useSystemFonts:false,disableFontFace:true,useWasm:false,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,stopAtErrors:true,verbosity:0};
  const task=pdfjs.getDocument(options);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    return await Promise.race([
      (async()=>{
        task.onPassword=()=>{void task.destroy();};
        const pdf=await task.promise;
        if(pdf.numPages>25)throw Error('Use a PDF with at most 25 pages. Split large documents first.');
        const actions=await pdf.getJSActions();if(actions&&Object.keys(actions).length)throw Error('PDFs containing scripts are not accepted. Export a plain PDF or text document.');
        let text='';
        for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
          const page=await pdf.getPage(pageNumber);const content=await page.getTextContent();
          text+=content.items.map(item=>'str'in item?item.str+('hasEOL'in item&&item.hasEOL?'\n':' '):'').join('')+'\n\n';
          page.cleanup();if(text.length>KNOWLEDGE_LIMIT)throw Error('The PDF exceeds 50,000 text characters. Split it into smaller sections.');
        }
        if(text.trim().length<30)throw Error('This PDF has no extractable text. Scanned images need OCR first; upload a text-based PDF.');
        return text.trim();
      })(),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void task.destroy();reject(Error('PDF extraction timed out. Try a smaller document.'));},20000);}),
    ]);
  } finally {clearTimeout(timer);await task.destroy();}
}
