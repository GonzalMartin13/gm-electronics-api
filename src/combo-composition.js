// Composition supplied by Gonzalo; product names and colors verified against the API.
const products=[
 ['1700','Auriculares Noga NG-1700 · blanco','audio'],
 ['1699','Auriculares Noga NG-1700 · negro','audio'],
 ['2069','Auriculares Noga NG-BTWINS 2 · TWS blanco','audio'],
 ['1959','Auriculares Noga NG-BTWINS 48 · TWS negro','audio'],
 ['5011','Auriculares Noga NG-A910BT Aris · negro','audio'],
 ['5012','Auriculares Noga NG-A910BT Aris · gris','audio'],
 ['1480','Cargador Kosmo 2,75A + cable Micro USB','chargers'],
 ['3010','Cargador Kosmo 2,75A + cable USB-C','chargers'],
 ['3011','Cargador Kosmo PD 25W + cable C-Lightning · blanco','chargers'],
 ['3013','Cargador Kosmo PD 25W + cable C-C · negro','chargers'],
 ['0052','Cable Kosmo USB-Micro USB · 1 m','cables'],
 ['0053','Cable Kosmo USB-C · 1 m','cables'],
 ['1557','Cable Kosmo C-C 30W · 1 m','cables'],
 ['1980','Cable Kosmo USB-Lightning · 1 m','cables'],
 ['2292','Cable Kosmo C-Lightning PD 20W · 1 m','cables'],
 ['2289','Cable Kosmo C-C PD 60W · 1 m','cables'],
];
const quantities={
 PackEco:[4,4,1,1,0,0,4,4,0,0,4,5,3,3,2,2],
 PackMid:[4,4,3,2,1,1,4,5,1,1,5,6,3,3,3,4],
 PackPro:[8,8,5,3,2,2,7,8,2,2,8,10,6,6,6,6],
};
export const comboComposition=Object.fromEntries(Object.entries(quantities).map(([code,counts])=>[code,products.flatMap(([codigo,nombre,category],index)=>counts[index]?[{codigo,nombre,category,cantidad:counts[index]}]:[])]));
export function compositionSummary(items){return items.reduce((sum,item)=>({...sum,units:sum.units+item.cantidad,[item.category]:sum[item.category]+item.cantidad}),{units:0,cables:0,chargers:0,audio:0})}

