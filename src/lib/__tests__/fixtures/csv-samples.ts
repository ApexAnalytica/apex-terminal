// ─── CSV Test Samples ────────────────────────────────────────────

export const NODE_CSV = `id,label,category,domain,composite,irreplaceability,cascade_load
n1,Node Alpha,manufacturing,EUV Lithography,8.5,7.0,9.0
n2,Node Beta,energy,Energy Grid,6.0,5.5,6.5
n3,Node Gamma,infrastructure,AI Compute,7.2,6.8,7.5`;

export const EDGE_CSV = `id,source,target,weight,lag,confidence,physical_mechanism
e1,n1,n2,0.8,0,0.9,powers
e2,n2,n3,0.6,2,0.7,constrains supply`;

export const ALIASED_HEADER_CSV = `node_id,name,category,domain,omega
x1,X Node,finance,Dollar Funding,9.0
x2,Y Node,geopolitical,Geopolitical,7.5`;

export const QUOTED_FIELDS_CSV = `id,label,category,domain
q1,"Node with, comma",manufacturing,"EUV Lithography"
q2,"Node with ""quotes""",energy,Energy Grid`;

export const EDGE_CSV_WITH_FROM_TO = `id,from,to,weight,type
e_ft1,a,b,0.5,directed
e_ft2,b,c,0.7,temporal`;

export const EMPTY_CSV = `id,label,category`;

export const HEADER_ONLY_CSV = `id,label`;

export const CSV_WITH_BOOLEANS = `id,label,category,is_confounded,is_restricted
b1,Confounded Node,infrastructure,true,false
b2,Restricted Node,energy,false,true`;
