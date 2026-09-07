import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import {
  previewCSV, importWithUrls, importWithZip,
  setImageMode, setCsvFile, setZipFile, goToStep, resetBulkUpload,
} from '../ADMIN_REDUX_MANAGEMENT/bulkUploadSlice';
import wholesaleAxios from "../../../SERVICES/Wholesaleaxios";
// ─── helpers ─────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString();

const downloadWithAuth = async (url) => {
  try {
    const toastId = toast.loading('Downloading error report...');
    
    const response = await wholesaleAxios.get(url, {
      responseType: 'blob'
    });
    
    const blob = new Blob([response.data], { type: 'text/csv' });
    const downloadUrl = URL.createObjectURL(blob);
    const filename = url.split('/').pop();
    
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
    
    toast.update(toastId, {
      render: 'Error report downloaded successfully!',
      type: 'success',
      isLoading: false,
      autoClose: 3000
    });
  } catch (error) {
    console.error('Download failed:', error);
    toast.error('Failed to download error report. Please try again.');
  }
};

// ─── Simulated progress hook ──────────────────────────────────
// Crawls from wherever the real upload % stopped toward 95%
// using an exponential ease so it feels alive during server processing.
// Snaps to 100 when the Redux fulfilled action sets importPct = 100.
function useSimulatedProgress(active, uploadPct) {
  const [displayPct, setDisplayPct] = useState(uploadPct);
  const rafRef   = useRef(null);
  const startRef = useRef(null);

  useEffect(() => { setDisplayPct(uploadPct); }, [uploadPct]);

  useEffect(() => {
    if (!active) { cancelAnimationFrame(rafRef.current); return; }
    startRef.current = performance.now();
    const startVal = uploadPct;
    const tick = (now) => {
      const elapsed  = now - startRef.current;
      const progress = 1 - Math.exp(-elapsed / 90000); // ~95% after 90s
      setDisplayPct(Math.round(Math.min(95, startVal + (95 - startVal) * progress)));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  return displayPct;
}

// ─── Toast body rendered inside react-toastify ────────────────
// Used for partial failures — keeps the download button right in
// the notification so the admin can act immediately.
const FailureToastBody = ({ failedCount, downloadUrl, onDownload }) => ( // ✅ Added onDownload prop
  <div className="flex flex-col gap-2">
    <p className="text-sm font-semibold text-slate-800">Import completed with issues</p>
    <p className="text-xs text-slate-600">
      {failedCount} product{failedCount !== 1 ? 's' : ''} failed to save.
      All other products were saved successfully.
    </p>
    {downloadUrl && (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDownload(downloadUrl); // ✅ CHANGED: call onDownload instead of window.open
        }}
        className="self-start text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
      >
        ↓ Download error report
      </button>
    )}
    <p className="text-[11px] text-slate-400">
      Fix the errors in your Excel file, then re-upload from the Upload tab.
    </p>
  </div>
);
// ─── StatusBadge ─────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    success            : 'bg-emerald-50 text-emerald-700 border-emerald-200',
    saved_with_warnings: 'bg-amber-50  text-amber-700  border-amber-200',
    failed             : 'bg-red-50    text-red-700    border-red-200',
    pending            : 'bg-slate-50  text-slate-500  border-slate-200',
  };
  const label = {
    success            : 'Saved',
    saved_with_warnings: 'Saved with warnings',
    failed             : 'Failed',
    pending            : 'Pending',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${map[status] || map.pending}`}>
      {label[status] || status}
    </span>
  );
};

// ─── ProgressBar ─────────────────────────────────────────────
const ProgressBar = ({ pct, color = 'bg-indigo-500' }) => (
  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
    <div
      className={`h-2 rounded-full transition-all duration-500 ${color}`}
      style={{ width: `${Math.min(100, pct)}%` }}
    />
  </div>
);

// ─── DropZone ────────────────────────────────────────────────
const DropZone = ({ accept, label, hint, icon, onFile, file, disabled }) => {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);

  const handle     = (f) => { if (f && !disabled) onFile(f); };
  const onDrop     = useCallback((e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }, [disabled]);
  const onDragOver = (e) => { e.preventDefault(); !disabled && setDrag(true); };
  const onDragLeave= (e) => { e.preventDefault(); setDrag(false); };

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
      className={`
        relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        ${drag
          ? 'border-indigo-400 bg-indigo-50'
          : file
            ? 'border-emerald-400 bg-emerald-50'
            : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40'
        }
      `}
    >
      <input
        ref={inputRef} type="file" accept={accept} className="hidden"
        disabled={disabled} onChange={(e) => handle(e.target.files[0])}
      />
      <div className="text-3xl mb-2">{file ? '✅' : icon}</div>
      {file ? (
        <p className="text-sm font-medium text-emerald-700 truncate">
          {file.name}{' '}
          <span className="text-emerald-500">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
        </p>
      ) : (
        <>
          <p className="text-sm font-semibold text-slate-700">{label}</p>
          <p className="text-xs text-slate-400 mt-1">{hint}</p>
        </>
      )}
    </div>
  );
};

// ─── Collapsible product row ──────────────────────────────────
const ProductRow = ({ item }) => {
  const [open, setOpen] = useState(false);
  const hasDetail = item.warnings?.length > 0 || item.errors?.length > 0;
  return (
    <>
      <tr className={`border-b border-slate-100 ${item.status === 'failed' ? 'bg-red-50/30' : ''}`}>
        <td className="py-2.5 px-4 text-sm font-medium text-slate-800 max-w-[200px] truncate">
          {item.name}
          {item.isSummary && (
            <span className="ml-1.5 text-[10px] font-normal text-slate-400 uppercase tracking-wide">summary</span>
          )}
        </td>
        <td className="py-2.5 px-4"><StatusBadge status={item.status} /></td>
        <td className="py-2.5 px-4 text-sm text-slate-600 text-center">
          {item.imageCount != null ? fmt(item.imageCount) : '—'}
        </td>
        <td className="py-2.5 px-4 text-sm text-amber-600 text-center">{item.warnings?.length || 0}</td>
        <td className="py-2.5 px-4 text-sm text-red-600 text-center">{item.errors?.length || 0}</td>
        <td className="py-2.5 px-4">
          {hasDetail && (
            <button onClick={() => setOpen(o => !o)} className="text-xs text-indigo-600 hover:underline">
              {open ? '▲ Hide' : '▼ Detail'}
            </button>
          )}
        </td>
      </tr>
      {open && hasDetail && (
        <tr className="bg-slate-50 border-b border-slate-100">
          <td colSpan={6} className="px-4 py-2 space-y-1">
            {item.errors?.map((e, i) => (
              <div key={i} className="flex gap-2 text-xs text-red-700"><span className="mt-0.5">❌</span><span>{e}</span></div>
            ))}
            {item.warnings?.map((w, i) => (
              <div key={i} className="flex gap-2 text-xs text-amber-700"><span className="mt-0.5">⚠️</span><span>{w}</span></div>
            ))}
          </td>
        </tr>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════════
// MAIN MODAL
// ═══════════════════════════════════════════════════════════════
const BulkUploadModal = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const {
    step, imageMode,
    csvFile, csvPct, previewing, previewData, csvError,
    zipFile, importPct, importing, result, importError,
  } = useSelector((s) => s.adminBulkUpload);

  const [resultTab, setResultTab] = useState('all');

  // Animated display progress
  const displayImportPct = useSimulatedProgress(importing, importPct);
  const displayCsvPct    = useSimulatedProgress(previewing, csvPct);

  // ── Fire toast exactly once when result arrives ───────────────
  // We track the previous step with a ref so this only fires on
  // the transition  importing → result, never on re-renders.
  const prevStep = useRef(step);
  useEffect(() => {
    if (prevStep.current !== 'result' && step === 'result' && result) {
      const { insertedProducts = 0, updatedProducts = 0, failedCount = 0, downloadUrl } = result;
      const savedCount = insertedProducts + updatedProducts;

      if (failedCount === 0) {
        // ✅ Everything saved
        toast.success(
          `Import complete — ${fmt(savedCount)} product${savedCount !== 1 ? 's' : ''} saved successfully!`,
          { autoClose: 5000 }
        );
      } else if (savedCount === 0) {
        // ❌ Nothing saved at all
        toast.error(
          `Import failed — all ${fmt(failedCount)} product${failedCount !== 1 ? 's' : ''} had errors. Download the error report to fix them.`,
          { autoClose: false }
        );
      } else {
        // ⚠️ Partial — some saved, some failed → persistent toast with download button
     toast.warning(
            <FailureToastBody 
              failedCount={failedCount} 
              downloadUrl={downloadUrl}
              onDownload={(url) => downloadWithAuth(url)} // ✅ ADD THIS LINE
            />,
            {
              autoClose   : false,
              closeOnClick: false,
              icon        : false,
            }
          );
      }
    }
    prevStep.current = step;
  }, [step, result]);

  const [templateDownloading, setTemplateDownloading] = useState(false);

  const handleDownloadTemplate = async () => {
    if (templateDownloading) return;
    setTemplateDownloading(true);
    const toastId = toast.loading("Generating template...");
    try {
      const response = await wholesaleAxios.get("/admin/products/bulk-upload-template", {
        responseType: "blob",
      });
      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "bulk_upload_template.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
      toast.update(toastId, {
        render: "Template downloaded successfully!",
        type: "success",
        isLoading: false,
        autoClose: 3000,
      });
    } catch (error) {
      console.error("Template download failed:", error);
      toast.update(toastId, {
        render: "Failed to download template. Please try again.",
        type: "error",
        isLoading: false,
        autoClose: 3000,
      });
    } finally {
      setTemplateDownloading(false);
    }
  };

  const handleClose        = () => { dispatch(resetBulkUpload()); setResultTab('all'); onClose(); };
  const handlePreview      = () => { if (csvFile)            dispatch(previewCSV(csvFile)); };
  const handleModeAImport  = () => { if (csvFile)            dispatch(importWithUrls(csvFile)); };
  const handleZipImport    = () => { if (csvFile && zipFile) dispatch(importWithZip({ csvFile, zipFile })); };
  const handleDownloadReport = (url) => downloadWithAuth(url);

  if (!isOpen) return null;

  // ─── Step bar config ──────────────────────────────────────
  const modeASteps     = ['Choose mode', 'Upload Excel', 'Preview', 'Done'];
  const modeBSteps     = ['Choose mode', 'Upload Excel', 'Preview', 'Upload ZIP', 'Done'];
  const steps          = imageMode === 'zip' ? modeBSteps : modeASteps;
  const stepIndexMap   = {
    mode     : 0,
    upload   : 1,
    preview  : 2,
    zip      : 3,
    importing: imageMode === 'zip' ? 4 : 3,
    result   : imageMode === 'zip' ? 4 : 3,
  };
  const currentStepIdx = stepIndexMap[step] ?? 0;

  // ─── Result tab helpers ───────────────────────────────────
  const products  = result?.products || [];
  const tabCounts = {
    all     : products.length,
    success : products.filter(p => p.status === 'success').length,
    warnings: products.filter(p => p.status === 'saved_with_warnings').length,
    failed  : products.filter(p => p.status === 'failed').length,
  };
  const filteredProducts = products.filter(p => {
    if (resultTab === 'all')      return true;
    if (resultTab === 'success')  return p.status === 'success';
    if (resultTab === 'warnings') return p.status === 'saved_with_warnings';
    if (resultTab === 'failed')   return p.status === 'failed';
    return true;
  });

  const progressColor = imageMode === 'zip' ? 'bg-violet-500' : 'bg-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Bulk Product Upload</h2>
            <p className="text-xs text-slate-400 mt-0.5">Import products from Excel or CSV</p>
          </div>
          <button onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors text-lg">
            ✕
          </button>
        </div>

        {/* ── Step bar ───────────────────────────────────────── */}
        {step !== 'mode' && (
          <div className="px-6 py-3 border-b border-slate-50 flex items-center gap-2">
            {steps.map((s, i) => {
              const done   = i < currentStepIdx;
              const active = i === currentStepIdx;
              return (
                <React.Fragment key={i}>
                  <div className={`flex items-center gap-1.5 text-xs font-medium transition-colors
                    ${done ? 'text-emerald-600' : active ? 'text-indigo-700' : 'text-slate-300'}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                      ${done ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {done ? '✓' : i + 1}
                    </span>
                    <span className="hidden sm:block">{s}</span>
                  </div>
                  {i < steps.length - 1 && <div className={`flex-1 h-px ${done ? 'bg-emerald-200' : 'bg-slate-100'}`} />}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* ── Body ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ══ MODE SELECTION ═══════════════════════════════════ */}
          {step === 'mode' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-indigo-900">Need a template with dynamic dropdown values?</h4>
                  <p className="text-xs text-indigo-700">
                    Get a pre-formatted Excel template with dropdown lists for categories, status, gstRate, isFragile, and more.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  disabled={templateDownloading}
                  className="flex-shrink-0 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {templateDownloading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Downloading Template...</span>
                    </>
                  ) : (
                    <span>📥 Download Excel Template</span>
                  )}
                </button>
              </div>

              <p className="text-sm text-slate-600 font-medium">How are you providing product images?</p>
              <div className="grid  grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={() => dispatch(setImageMode('url'))}
                  className="group border-2 border-slate-200 cursor-pointer rounded-2xl p-5 text-left hover:border-indigo-400 hover:bg-indigo-50/40 transition-all">
                  <div className="text-3xl mb-3">🔗</div>
                  <div className="font-semibold text-slate-800 group-hover:text-indigo-800 mb-1">Image URLs in Excel</div>
                  <div className="text-xs text-slate-500 leading-relaxed">
                    Your spreadsheet already has image URLs in the{' '}
                    <code className="bg-slate-100 px-1 rounded">images</code> column.
                    Upload just the Excel file — we fetch and upload images automatically.
                  </div>
                  <div className="mt-3 text-xs font-medium text-indigo-600 group-hover:text-indigo-700">1 file upload →</div>
                </button>

                <button onClick={() => dispatch(setImageMode('zip'))}
                  className="group border-2 border-slate-200 cursor-pointer rounded-2xl p-5 text-left hover:border-violet-400 hover:bg-violet-50/40 transition-all">
                  <div className="text-3xl mb-3">📦</div>
                  <div className="font-semibold text-slate-800 group-hover:text-violet-800 mb-1">Upload images separately</div>
                  <div className="text-xs text-slate-500 leading-relaxed">
                    Images are in a ZIP file. Each folder inside the ZIP is named after the product's{' '}
                    <strong>Product Code number</strong>. Drop the images inside their Product Code folder.
                  </div>
                  <div className="mt-3 text-xs font-medium text-violet-600 group-hover:text-violet-700">Excel + ZIP →</div>
                </button>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-500 leading-relaxed border border-slate-100">
                <strong className="text-slate-700">Required columns:</strong>{' '}
                name, title, category, basePrice, Product Code — everything else is optional.
                Multi-variant products: repeat the same product name on multiple rows with the same productCode base (e.g. 1001-1, 1001-2). Different products may share a display name if their productCode bases differ.
              </div>
            </div>
          )}

          {/* ══ UPLOAD — Mode A ═══════════════════════════════════ */}
          {step === 'upload' && imageMode === 'url' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                🔗 <strong>Mode: Image URLs in Excel</strong> — Make sure your Excel has an{' '}
                <code className="bg-white px-1 rounded">images</code> column with comma-separated URLs per row.
              </p>
              <DropZone accept=".csv,.xls,.xlsx" label="Drop your Excel / CSV file"
                hint="CSV, XLS or XLSX — max 10 MB" icon="📄"
                file={csvFile} onFile={(f) => dispatch(setCsvFile(f))} disabled={previewing} />
              {csvError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{csvError}</p>}
              {previewing && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Parsing file…</span><span>{displayCsvPct}%</span>
                  </div>
                  <ProgressBar pct={displayCsvPct} />
                </div>
              )}
            </div>
          )}

          {/* ══ UPLOAD — Mode B ═══════════════════════════════════ */}
          {step === 'upload' && imageMode === 'zip' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                📦 <strong>Mode: Separate ZIP images</strong> — Upload your Excel first to preview
                products, then you'll upload the ZIP file.
              </p>
              <DropZone accept=".csv,.xls,.xlsx" label="Drop your Excel / CSV file"
                hint="CSV, XLS or XLSX — max 10 MB" icon="📄"
                file={csvFile} onFile={(f) => dispatch(setCsvFile(f))} disabled={previewing} />
              {csvError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{csvError}</p>}
              {previewing && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Parsing file…</span><span>{displayCsvPct}%</span>
                  </div>
                  <ProgressBar pct={displayCsvPct} color="bg-violet-500" />
                </div>
              )}
            </div>
          )}

          {/* ══ PREVIEW ═══════════════════════════════════════════ */}
          {step === 'preview' && previewData && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total products', value: previewData.totalProducts, color: 'text-slate-800' },
                  { label: 'Valid',           value: previewData.validCount,    color: 'text-emerald-700' },
                  { label: 'Has errors',      value: previewData.invalidCount,  color: 'text-red-600' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                    <div className={`text-2xl font-bold ${color}`}>{fmt(value)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              {imageMode === 'url' && previewData.hasImageUrls && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-xs text-indigo-700">
                  ✅ Image URLs detected — they'll be downloaded and uploaded to Cloudinary on import.
                </div>
              )}
              {imageMode === 'url' && !previewData.hasImageUrls && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
                  ⚠️ No image URLs found. Products will be imported without images. You can add them manually afterwards.
                </div>
              )}

              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-60">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                      <tr>
                        {['Product', 'Category', 'Variants', 'Product Codes', 'Qty', 'Images', 'Status'].map(h => (
                          <th key={h} className="py-2 px-3 text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.preview?.map((p, i) => (
                        <tr key={i} className={`border-b border-slate-50 ${p.hasErrors ? 'bg-red-50/30' : ''}`}>
                          <td className="py-2 px-3 text-xs font-medium text-slate-800 max-w-[140px] truncate">{p.name}</td>
                          <td className="py-2 px-3 text-xs text-slate-500">{p.category}</td>
                          <td className="py-2 px-3 text-xs text-center">{p.variantCount}</td>
                          <td className="py-2 px-3 text-xs text-slate-500 max-w-[100px] truncate">{p.productCode?.join(', ')}</td>
                          <td className="py-2 px-3 text-xs text-center">{fmt(p.totalQuantity)}</td>
                          <td className="py-2 px-3 text-xs text-center">{imageMode === 'url' ? (p.imageUrlCount || '—') : '(ZIP)'}</td>
                          <td className="py-2 px-3">
                            {p.hasErrors
                              ? <span className="text-xs text-red-600">⚠ {p.errors?.join('; ')}</span>
                              : <span className="text-xs text-emerald-600">✓ OK</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {previewData.invalidCount > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  ⚠ {previewData.invalidCount} product(s) have validation errors and will be{' '}
                  <strong>skipped</strong> during import. Fix them in your file and re-upload, or proceed
                  to import only the valid ones.
                </p>
              )}
            </div>
          )}

          {/* ══ ZIP UPLOAD — Mode B ═══════════════════════════════ */}
          {step === 'zip' && (
            <div className="space-y-4">
              {previewData && (
                <div className="bg-violet-50 border border-violet-100 rounded-lg px-3 py-2 text-xs text-violet-700">
                  📋 Ready to import <strong>{previewData.validCount}</strong> product(s). Now drop the ZIP file.
                </div>
              )}
              <DropZone accept=".zip" label="Drop your ZIP file of product images"
                hint="Max 500 MB — one folder per Product Code number" icon="📦"
                file={zipFile} onFile={(f) => dispatch(setZipFile(f))} disabled={importing} />
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs text-slate-600 space-y-2">
                <p className="font-semibold text-slate-700">ZIP folder structure:</p>
                <pre className="font-mono text-slate-500 leading-relaxed bg-white rounded-lg p-3 border border-slate-100 text-[11px]">
{`images.zip
├── 665563/          ← Product Code number
│   ├── front.jpg
│   └── back.jpg
├── 45225/
│   └── photo1.webp
└── 2233652/
    └── main.jpg`}
                </pre>
                <p className="text-slate-400">Supported: JPG, PNG, WebP — up to 5 images per variant.</p>
              </div>
              {importError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{importError}</p>
              )}
            </div>
          )}

          {/* ══ IMPORTING ═════════════════════════════════════════ */}
          {step === 'importing' && (
            <div className="py-8 text-center space-y-4">
              <div className="text-5xl animate-bounce">⚡</div>
              <p className="font-semibold text-slate-800">Importing products…</p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                {imageMode === 'url'
                  ? 'Downloading image URLs and uploading to Cloudinary. This may take a few minutes.'
                  : 'Extracting ZIP, matching barcodes, uploading images to Cloudinary…'}
              </p>
              <div className="max-w-xs mx-auto space-y-2">
                <ProgressBar pct={displayImportPct} color={progressColor} />
                <div className="flex justify-between text-xs text-slate-400">
                  <span>
                    {displayImportPct < 40 ? 'Uploading file…'
                      : displayImportPct < 70 ? 'Processing products…'
                      : displayImportPct < 90 ? 'Uploading images…'
                      : 'Finishing up…'}
                  </span>
                  <span>{displayImportPct}%</span>
                </div>
              </div>
              <p className="text-xs text-slate-300">Do not close this window.</p>
            </div>
          )}

          {/* ══ RESULT ════════════════════════════════════════════ */}
          {step === 'result' && result && (
            <div className="space-y-4">

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total rows', value: result.totalRows,        color: 'text-slate-800' },
                  { label: 'Inserted',   value: result.insertedProducts, color: 'text-emerald-700' },
                  { label: 'Updated',    value: result.updatedProducts,  color: 'text-indigo-700' },
                  { label: 'Failed',     value: result.failedCount,      color: 'text-red-600' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                    <div className={`text-2xl font-bold ${color}`}>{fmt(value)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              {/* ✅ Full success banner */}
              {result.failedCount === 0 && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-xs text-emerald-700">
                  ✅ All products imported successfully! You can close this window or import another batch.
                </div>
              )}

              {/* ⚠️ Partial or total failure — prominent download CTA */}
              {result.failedCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-xl leading-none mt-0.5">⚠️</span>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-semibold text-amber-800">
                        {result.failedCount} product{result.failedCount !== 1 ? 's' : ''} failed to import
                      </p>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        All other products were saved successfully. Download the error report to see exactly
                        which rows failed and why — fix them in your Excel file, then come back and
                        re-upload normally.
                      </p>
                    </div>
                  </div>

                 {result.downloadUrl && (
                      <button
                        onClick={() => downloadWithAuth(result.downloadUrl)} // ✅ CHANGED: call downloadWithAuth directly
                        className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                      >
                        <span>↓</span>
                        <span>Download error report (CSV)</span>
                      </button>
                    )}

                  <p className="text-[11px] text-amber-600">
                    The report contains: product name · row number · exact error reason
                  </p>
                </div>
              )}

              {/* Tab bar */}
              <div className="flex gap-1 border-b border-slate-100">
                {['all', 'success', 'warnings', 'failed'].map(tab => (
                  <button key={tab} onClick={() => setResultTab(tab)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 transition-colors capitalize
                      ${resultTab === tab ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                    {tab} ({tabCounts[tab] || 0})
                  </button>
                ))}
              </div>

              {/* Result table */}
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                      <tr>
                        {['Product', 'Status', 'Images', 'Warnings', 'Errors', ''].map(h => (
                          <th key={h} className="py-2 px-4 text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.length > 0 ? (
                        filteredProducts.map((p, i) => <ProductRow key={i} item={p} />)
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-xs text-slate-400">
                            No products in this category.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>{/* /body */}

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button onClick={handleClose} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
            {step === 'result' ? 'Close' : 'Cancel'}
          </button>

          <div className="flex items-center gap-2">
            {/* Back */}
            {step === 'upload' && (
              <button onClick={() => dispatch(goToStep('mode'))}
                className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                ← Back
              </button>
            )}
            {step === 'preview' && imageMode === 'zip' && (
              <button onClick={() => dispatch(goToStep('upload'))}
                className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                ← Back
              </button>
            )}
            {step === 'zip' && (
              <button onClick={() => dispatch(goToStep('preview'))}
                className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                ← Back
              </button>
            )}

            {/* Mode A — Upload → Preview */}
            {step === 'upload' && imageMode === 'url' && (
              <button disabled={!csvFile || previewing} onClick={handlePreview}
                className="text-sm px-5 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {previewing ? 'Parsing…' : 'Preview →'}
              </button>
            )}
            {/* Mode A — Preview → Import */}
            {step === 'preview' && imageMode === 'url' && (
              <button disabled={importing || !previewData?.validCount} onClick={handleModeAImport}
                className="text-sm px-5 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Import {previewData?.validCount || 0} product{previewData?.validCount !== 1 ? 's' : ''} →
              </button>
            )}
            {/* Mode B — Upload → Preview */}
            {step === 'upload' && imageMode === 'zip' && (
              <button disabled={!csvFile || previewing} onClick={handlePreview}
                className="text-sm px-5 py-2 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {previewing ? 'Parsing…' : 'Preview →'}
              </button>
            )}
            {/* Mode B — Preview → ZIP */}
            {step === 'preview' && imageMode === 'zip' && (
              <button disabled={!previewData?.validCount} onClick={() => dispatch(goToStep('zip'))}
                className="text-sm px-5 cursor-pointer py-2 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Next: Upload ZIP →
              </button>
            )}
            {/* Mode B — ZIP → Import */}
            {step === 'zip' && (
              <button disabled={!zipFile || !csvFile || importing} onClick={handleZipImport}
                className="text-sm px-5 py-2 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {importing ? 'Importing…' : `Import ${previewData?.validCount || 0} product${previewData?.validCount !== 1 ? 's' : ''} →`}
              </button>
            )}
            {/* Result — import another batch */}
            {step === 'result' && (
              <button onClick={() => dispatch(resetBulkUpload())}
                className="text-sm px-5 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors">
                Import another batch
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default BulkUploadModal;