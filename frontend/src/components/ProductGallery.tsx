// import React from 'react';
// import type { Product } from '../types';
// import { resolveImageUrl } from '../utils/productImages';

// interface Props {
//   products: Product[];
//   onSelectProduct: (prod: Product) => void;
//   onOpenSetup: () => void;
//   isEmbed?: boolean;
// }

// export default function ProductGallery({ products, onSelectProduct, onOpenSetup, isEmbed = false }: Props) {
//   return (
//     <div>
//       <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '8px' }}>
//         <div>
//           {isEmbed ? (
//             <>
//               <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#2563eb' }}>
//                 <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 999, background: '#eff6ff', color: '#2563eb', fontSize: '0.9rem' }}>🛍️</span>
//                 <strong style={{ fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Shopper embed</strong>
//               </div>
//               <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0 }}>
//                 Shop and customize products
//               </h1>
//             </>
//           ) : (
//             <>
//               <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0 }}>
//                 Pick a Product
//               </h1>
//             </>
//           )}
//         </div>
//       </div>
//       <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>
//         {isEmbed
//           ? 'Select a store product and launch the embedded design experience.'
//           : 'Select a physical merchandise from the gallery to begin customizing in 3D & 2D views.'
//         }
//       </p>

//       <div className="gallery-grid">
//         {products.map((prod) => (
//           <div
//             key={prod.id}
//             className="prod-card"
//             onClick={() => onSelectProduct(prod)}
//           >
//             <img
//               src={resolveImageUrl(prod.image_url || prod.external_product_url, prod.name)}
//               alt={prod.name}
//               loading="lazy"
//             />
//             <div style={{ padding: '0 12px' }}>
//               <p style={{ margin: '12px 0 8px', fontWeight: 600 }}>{prod.name}</p>
//               {!isEmbed && (
//                 <a 
//                   href={`/admin/customizer/designsubmission/?product__id__exact=${prod.id}`} 
//                   target="_blank" 
//                   rel="noreferrer"
//                   onClick={(e) => e.stopPropagation()}
//                   style={{ 
//                     display: 'inline-block', 
//                     marginBottom: '12px', 
//                     fontSize: '0.8rem', 
//                     color: '#2563eb', 
//                     textDecoration: 'none',
//                     background: '#eff6ff',
//                     padding: '4px 8px',
//                     borderRadius: '4px',
//                     border: '1px solid #bfdbfe'
//                   }}
//                 >
//                   📄 View Submissions
//                 </a>
//               )}
//             </div>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

