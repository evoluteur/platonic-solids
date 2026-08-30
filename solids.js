/*!
 * Platonic Solids - geometry engine
 * https://github.com/evoluteur/platonic-solids
 * (c) 2026 Olivier Giulieri - MIT license
 *
 * Only the twenty-something vertex coordinates are written down. Faces,
 * edges, duals, nets and every measurement are derived from them, so the
 * data cannot disagree with itself.
 */

const PHI = (1 + Math.sqrt(5)) / 2;
const EPS = 1e-6;

/* ------------------------------------------------------------ vector math */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / len(a));
const mean = (pts) =>
  mul(
    pts.reduce((s, p) => add(s, p), [0, 0, 0]),
    1 / pts.length,
  );

/* ------------------------------------------------------- vertex positions */

// every cyclic permutation of (a, b, c), with every sign on the nonzero parts
const cyclicSigns = (a, b, c) => {
  const out = [];
  [
    [a, b, c],
    [c, a, b],
    [b, c, a],
  ].forEach(([x, y, z]) => {
    const signs = (v) => (v === 0 ? [0] : [v, -v]);
    signs(x).forEach((sx) =>
      signs(y).forEach((sy) =>
        signs(z).forEach((sz) => out.push([sx, sy, sz])),
      ),
    );
  });
  return out;
};

const corners = () => {
  const out = [];
  [-1, 1].forEach((x) =>
    [-1, 1].forEach((y) => [-1, 1].forEach((z) => out.push([x, y, z]))),
  );
  return out;
};

const VERTICES = {
  tetrahedron: () => [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ],
  cube: () => corners(),
  octahedron: () =>
    cyclicSigns(1, 0, 0).filter((p, i, a) => a.indexOf(p) === i),
  dodecahedron: () => corners().concat(cyclicSigns(0, 1 / PHI, PHI)),
  icosahedron: () => cyclicSigns(0, 1, PHI),
};

// drop duplicates that the cyclic generator can produce, and put every
// vertex on the unit sphere so all five are directly comparable
const cleanVerts = (pts) => {
  const out = [];
  pts.forEach((p) => {
    if (!out.some((q) => len(sub(p, q)) < EPS)) out.push(p);
  });
  return out.map(unit);
};

/* ---------------------------------------------------------- convex hull */

// Every plane through three vertices that leaves all the others on one side
// is a face. O(n^3) with n <= 20, which is nothing, and it means the same
// code builds the solids, their duals, and anything else convex.
const hullFaces = (verts) => {
  const faces = [];
  const planes = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const normal = cross(sub(verts[j], verts[i]), sub(verts[k], verts[i]));
        if (len(normal) < EPS) continue;
        let nrm = unit(normal);
        let d = dot(nrm, verts[i]);
        if (d < 0) {
          nrm = mul(nrm, -1);
          d = -d;
        }
        if (d < EPS) continue; // plane through the centre, not a face
        if (verts.some((v) => dot(nrm, v) > d + EPS)) continue;
        // compare planes numerically: string keys trip over -0 and rounding
        if (
          planes.some(
            (p) => Math.abs(p.d - d) < EPS && len(sub(p.n, nrm)) < EPS,
          )
        )
          continue;
        planes.push({ n: nrm, d });
        const idx = [];
        verts.forEach((v, vi) => {
          if (Math.abs(dot(nrm, v) - d) < EPS) idx.push(vi);
        });
        // wind them counter-clockwise as seen from outside
        const c = mean(idx.map((vi) => verts[vi]));
        const u = unit(sub(verts[idx[0]], c));
        const w = cross(nrm, u);
        idx.sort((p, q) => {
          const ap = sub(verts[p], c);
          const aq = sub(verts[q], c);
          return (
            Math.atan2(dot(ap, w), dot(ap, u)) -
            Math.atan2(dot(aq, w), dot(aq, u))
          );
        });
        faces.push(idx);
      }
    }
  }
  return faces;
};

const edgesOf = (faces) => {
  const seen = new Set();
  const out = [];
  faces.forEach((f) => {
    f.forEach((a, i) => {
      const b = f[(i + 1) % f.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push([a, b]);
      }
    });
  });
  return out;
};

// the dual is the hull of the face centres
const dualVerts = (verts, faces) =>
  faces.map((f) => unit(mean(f.map((i) => verts[i]))));

/* ------------------------------------------------------------ unfolding */

// Lay one face flat in its own plane, keeping every edge length exact.
const flatten = (verts, face) => {
  const pts = face.map((i) => verts[i]);
  const nrm = unit(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
  const u = unit(sub(pts[1], pts[0]));
  const w = cross(nrm, u);
  return pts.map((p) => [dot(sub(p, pts[0]), u), dot(sub(p, pts[0]), w)]);
};

const side = (a, b, p) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

// Walk a spanning tree of the face-adjacency graph, hinging each face into
// the plane about the edge it shares with its parent. "order" reshuffles the
// neighbour visits, which is how a net that folds without overlapping is found.
const unfold = (verts, faces, root = 0, order = 0) => {
  const adjacency = faces.map(() => []);
  faces.forEach((f, fi) => {
    f.forEach((a, i) => {
      const b = f[(i + 1) % f.length];
      faces.forEach((g, gi) => {
        if (gi === fi) return;
        if (g.includes(a) && g.includes(b)) adjacency[fi].push({ gi, a, b });
      });
    });
  });

  const placed = new Array(faces.length).fill(null);
  const local = faces.map((f) => flatten(verts, f));
  placed[root] = local[root].slice();

  const queue = [root];
  while (queue.length) {
    const fi = queue.shift();
    const neighbours = adjacency[fi].slice();
    // rotate the visit order; different orders give different net shapes
    const shift = order % Math.max(neighbours.length, 1);
    const rotated = neighbours.slice(shift).concat(neighbours.slice(0, shift));
    rotated.forEach(({ gi, a, b }) => {
      if (placed[gi]) return;
      const A = placed[fi][faces[fi].indexOf(a)];
      const B = placed[fi][faces[fi].indexOf(b)];
      const la = local[gi][faces[gi].indexOf(a)];
      const lb = local[gi][faces[gi].indexOf(b)];
      // rigid map taking la -> A and lb -> B
      const d1 = [lb[0] - la[0], lb[1] - la[1]];
      const d2 = [B[0] - A[0], B[1] - A[1]];
      const ang = Math.atan2(d2[1], d2[0]) - Math.atan2(d1[1], d1[0]);
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      let pts = local[gi].map((p) => {
        const x = p[0] - la[0];
        const y = p[1] - la[1];
        return [A[0] + x * cosA - y * sinA, A[1] + x * sinA + y * cosA];
      });
      // the child must land on the far side of the hinge from its parent
      const parentAway = placed[fi].find((p) => Math.abs(side(A, B, p)) > 1e-9);
      const childAway = pts.find((p) => Math.abs(side(A, B, p)) > 1e-9);
      if (side(A, B, parentAway) * side(A, B, childAway) > 0) {
        pts = pts.map((p) => {
          // reflect across the line AB
          const dx = B[0] - A[0];
          const dy = B[1] - A[1];
          const l2 = dx * dx + dy * dy;
          const t = ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / l2;
          const px = A[0] + t * dx;
          const py = A[1] + t * dy;
          return [2 * px - p[0], 2 * py - p[1]];
        });
      }
      placed[gi] = pts;
      queue.push(gi);
    });
  }
  return { polys: placed, hinges: hingeList(faces, adjacency, placed) };
};

const hingeList = (faces, adjacency, placed) => {
  const out = [];
  const seen = new Set();
  faces.forEach((f, fi) => {
    adjacency[fi].forEach(({ gi, a, b }) => {
      const key = fi < gi ? `${fi}-${gi}` : `${gi}-${fi}`;
      if (seen.has(key)) return;
      const A = placed[fi][faces[fi].indexOf(a)];
      const B = placed[fi][faces[fi].indexOf(b)];
      const A2 = placed[gi][faces[gi].indexOf(a)];
      const B2 = placed[gi][faces[gi].indexOf(b)];
      // only a shared edge that stayed shared is a fold line
      if (
        Math.hypot(A[0] - A2[0], A[1] - A2[1]) < 1e-6 &&
        Math.hypot(B[0] - B2[0], B[1] - B2[1]) < 1e-6
      ) {
        seen.add(key);
        out.push([A, B]);
      }
    });
  });
  return out;
};

/* ------------------------------------------------------- the five solids */

// "net" is the spanning tree that unfolds without any face landing on
// another - found by searching every root and visit order, once, offline.
const SOLIDS = [
  {
    id: "tetrahedron",
    name: "Tetrahedron",
    schlafli: "{3,3}",
    faceName: "triangles",
    atVertex: 3,
    element: "Fire",
    symmetry: "Tetrahedral (Td), order 24",
    dual: "Tetrahedron (itself)",
    net: { root: 0, order: 0 },
    blurb:
      "The simplest solid that can exist: four triangles, the fewest faces that enclose any volume at all. It is its own dual, and the only one of the five whose faces do not come in parallel pairs. Plato gave it to fire, for its sharpness.",
  },
  {
    id: "cube",
    name: "Cube",
    schlafli: "{4,3}",
    faceName: "squares",
    atVertex: 3,
    element: "Earth",
    symmetry: "Octahedral (Oh), order 48",
    dual: "Octahedron",
    net: { root: 0, order: 0 },
    blurb:
      "The only Platonic solid that tiles space by itself, and the only one with square faces. Plato gave it to earth, for its stability: set it down and it stays where you put it.",
  },
  {
    id: "octahedron",
    name: "Octahedron",
    schlafli: "{3,4}",
    faceName: "triangles",
    atVertex: 4,
    element: "Air",
    symmetry: "Octahedral (Oh), order 48",
    dual: "Cube",
    net: { root: 0, order: 2 },
    blurb:
      "Two square pyramids glued base to base, and the dual of the cube: its six vertices sit on the cube's six face centres. Plato gave it to air, held loosely between the fingers.",
  },
  {
    id: "dodecahedron",
    name: "Dodecahedron",
    schlafli: "{5,3}",
    faceName: "pentagons",
    atVertex: 3,
    element: "Aether",
    symmetry: "Icosahedral (Ih), order 120",
    dual: "Icosahedron",
    net: { root: 0, order: 2 },
    blurb:
      "Twelve pentagons, and the golden ratio everywhere inside it - its vertices are the corners of a cube together with three golden rectangles. Plato held it back from the four elements and gave it to the cosmos itself.",
  },
  {
    id: "icosahedron",
    name: "Icosahedron",
    schlafli: "{3,5}",
    faceName: "triangles",
    atVertex: 5,
    element: "Water",
    symmetry: "Icosahedral (Ih), order 120",
    dual: "Dodecahedron",
    net: { root: 5, order: 2 },
    blurb:
      "Twenty triangles, five meeting at every vertex - the most faces the rules allow. Its twelve vertices are the corners of three golden rectangles at right angles. Plato gave it to water, the roundest and most mobile of the five.",
  },
];

const solidById = (id) => SOLIDS.find((s) => s.id === id) || SOLIDS[0];

// Every measurement is derived from the vertices, expressed per unit edge so
// the five are comparable.
const measure = (verts, faces) => {
  const edges = edgesOf(faces);
  const a = len(sub(verts[edges[0][0]], verts[edges[0][1]]));
  const normalOf = (f) =>
    unit(cross(sub(verts[f[1]], verts[f[0]]), sub(verts[f[2]], verts[f[0]])));
  const [p, q] = edges[0];
  const touching = faces.filter((f) => f.includes(p) && f.includes(q));
  const cosine = Math.max(
    -1,
    Math.min(1, dot(normalOf(touching[0]), normalOf(touching[1]))),
  );
  return {
    V: verts.length,
    E: edges.length,
    F: faces.length,
    dihedral: 180 - (Math.acos(cosine) * 180) / Math.PI,
    circumradius: 1 / a, // vertices are on the unit sphere
    inradius: dot(normalOf(faces[0]), verts[faces[0][0]]) / a,
    midradius: len(mean([verts[p], verts[q]])) / a,
  };
};

// everything the pages need for one solid, built from its vertices alone
const build = (id) => {
  const solid = solidById(id);
  const verts = cleanVerts(VERTICES[id]());
  const faces = hullFaces(verts);
  return {
    ...solid,
    verts,
    faces,
    edges: edgesOf(faces),
    dualVerts: dualVerts(verts, faces),
    stats: measure(verts, faces),
  };
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PHI,
    EPS,
    sub,
    add,
    mul,
    dot,
    cross,
    len,
    unit,
    mean,
    VERTICES,
    cleanVerts,
    hullFaces,
    edgesOf,
    dualVerts,
    unfold,
    flatten,
    SOLIDS,
    solidById,
    measure,
    build,
  };
}
