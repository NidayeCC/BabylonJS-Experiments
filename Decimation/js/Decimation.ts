﻿/*
 * Quadratic Error surfac simplification based on  http://www.cs.cmu.edu/afs/cs.cmu.edu/user/garland/www/Papers/quadric2.pdf
 * Code mostly ported from http://voxels.blogspot.de/2014/05/quadric-mesh-simplification-with-source.html to JavaScript / BabylonJS
 * Raanan Weber, 2015
 */


module RaananW.Decimation {

    export class DecimationTriangle {
        public normal: BABYLON.Vector3;
        public error: Array<number>;
        public deleted: boolean;
        public isDirty: boolean;
        public borderFactor: number;

        constructor(public vertices: Array<number>) {
            this.error = new Array<number>(4);
            this.deleted = false;
            this.isDirty = false;
            this.borderFactor = 0;
        }

    }

    export class DecimationVertex {
        public q: DecimationMatrix;
        public isBorder: boolean;

        public triangleStart: number;
        public triangleCount: number;

        constructor(public position: BABYLON.Vector3, public normal:BABYLON.Vector3, public uv:BABYLON.Vector2, public id) {
            this.isBorder = true;
            this.q = new DecimationMatrix();
            this.triangleCount = 0;
            this.triangleStart = 0;
        }
    }



    export class DecimationMatrix {
        public data: Array<number>;

        constructor(data?:Array<number>) {
            this.data = new Array(10);
            for (var i = 0; i < 10; ++i) {
                if (data && data[i]) {
                    this.data[i] = data[i];
                } else {
                    this.data[i] = 0;
                }
            }
        }

        public det( a11, a12, a13,
                    a21, a22, a23,
                    a31, a32, a33) {
            var det =   this.data[a11] * this.data[a22] * this.data[a33] + this.data[a13] * this.data[a21] * this.data[a32] +
                        this.data[a12] * this.data[a23] * this.data[a31] - this.data[a13] * this.data[a22] * this.data[a31] -
                        this.data[a11] * this.data[a23] * this.data[a32] - this.data[a12] * this.data[a21] * this.data[a33];
            return det;
        }

        public addInPlace(matrix: DecimationMatrix) {
            for (var i = 0; i < 10; ++i) {
                this.data[i] += matrix.data[i];
            }
        }

        public add(matrix: DecimationMatrix) : DecimationMatrix {
            var m = new DecimationMatrix();
            for (var i = 0; i < 10; ++i) {
                m.data[i] = this.data[i] + matrix.data[i];
            }
            return m;
        }

        public static FromData(a: number, b: number, c: number, d: number) : DecimationMatrix {
            var data = [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d];
            return new DecimationMatrix(data);
        }
    }

    export class Reference {
        constructor(public vertexId: number, public triangleId: number) {}
    }

    export class Decimator {
        private triangles: Array<DecimationTriangle>;
        private vertices: Array<DecimationVertex>;
        private references: Array<Reference>;

        private _mesh: BABYLON.Mesh;

        constructor(mesh?: BABYLON.Mesh) {

            this.vertices = [];
            this.triangles = [];

            if (mesh) {
                this.initWithMesh(mesh);
            }
        }

        public reInit() {
            this.initWithMesh();
        }

        public initWithMesh(mesh: BABYLON.Mesh = this._mesh) {
            if (!mesh) return;

            this._mesh = mesh;
            var positionData = this._mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            var normalData = this._mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
            var uvs = this._mesh.getVerticesData(BABYLON.VertexBuffer.UVKind);
            for (var i = 0; i < mesh.getTotalVertices(); ++i) {
                var vertex = new DecimationVertex(BABYLON.Vector3.FromArray(positionData, i * 3), BABYLON.Vector3.FromArray(normalData, i * 3), BABYLON.Vector2.FromArray(uvs, i * 2), i);
                this.vertices.push(vertex);
            }
            

            var indices = mesh.getIndices();
            for (var i = 0; i < indices.length; i = i + 3) {
                var i0 = indices[i + 0];
                var i1 = indices[i + 1];
                var i2 = indices[i + 2];
                var triangle = new DecimationTriangle([this.vertices[i0].id, this.vertices[i1].id, this.vertices[i2].id]);
                this.triangles.push(triangle);
            }

            this.init();
        }

        public reconstructMesh(): BABYLON.Mesh {

            console.log("compacting mesh");
            var newTriangles: Array<DecimationTriangle> = [];

            for (var i = 0; i < this.vertices.length; ++i) {
                this.vertices[i].triangleCount = 0;
            }
            for (var i = 0; i < this.triangles.length; ++i) {
                if (!this.triangles[i].deleted) {
                    var t = this.triangles[i];
                    for (var j = 0; j < 3; ++j) {
                        this.vertices[t.vertices[j]].triangleCount = 1;
                    }
                    newTriangles.push(t);
                }
            }

            var newVerticesOrder = [];

            //compact vertices, get the IDs of the vertices used.
            var dst = 0;
            for (var i = 0; i < this.vertices.length; ++i) {
                if (this.vertices[i].triangleCount) {
                    this.vertices[i].triangleStart = dst;
                    this.vertices[dst].position = this.vertices[i].position;
                    this.vertices[dst].normal = this.vertices[i].normal;
                    this.vertices[dst].uv = this.vertices[i].uv;
                    newVerticesOrder.push(i);
                    dst++;
                }
            }

            for (var i = 0; i < newTriangles.length; ++i) {
                var t = newTriangles[i];
                for (var j = 0; j < 3; ++j) {
                    t.vertices[j] = this.vertices[t.vertices[j]].triangleStart;
                }
            }
            this.vertices = this.vertices.slice(0, dst);
            
            var newPositionData = [];
            var newNormalData = [];
            var newUVsData = [];

            for (var i = 0; i < newVerticesOrder.length; ++i) {
                newPositionData.push(this.vertices[i].position.x);
                newPositionData.push(this.vertices[i].position.y);
                newPositionData.push(this.vertices[i].position.z);
                newNormalData.push(this.vertices[i].normal.x);
                newNormalData.push(this.vertices[i].normal.y);
                newNormalData.push(this.vertices[i].normal.z);
                newUVsData.push(this.vertices[i].uv.x);
                newUVsData.push(this.vertices[i].uv.y);             
            }

            var newIndicesArray: Array<number> = [];
            for (var i = 0; i < newTriangles.length; ++i) {
                
                newIndicesArray.push(newTriangles[i].vertices[0]);
                newIndicesArray.push(newTriangles[i].vertices[1]);
                newIndicesArray.push(newTriangles[i].vertices[2]);
            }
            
            var newMesh = this._mesh.clone(this._mesh.name + "AfterDecimation", this._mesh.parent);
            this._mesh.geometry.copy(this._mesh.geometry.id + "copy").applyToMesh(newMesh);
            newMesh.setIndices(newIndicesArray);
            newMesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, newPositionData);
            newMesh.setVerticesData(BABYLON.VertexBuffer.NormalKind, newNormalData);
            newMesh.setVerticesData(BABYLON.VertexBuffer.UVKind, newUVsData);

            return newMesh;
        }

        public runDecimation(quality: number, agressiveness: number = 7, iterations: number = 100) {
            var targetCount = ~~(this.triangles.length * quality);
            var deletedTriangles = 0;
            
            var triangleCount = this.triangles.length;

            for (var iteration = 0; iteration < iterations; ++iteration) {
                if (triangleCount - deletedTriangles <= targetCount) break;

                console.log("starting iteration " + iteration);

                if (iteration % 5 == 0) {
                    this.updateMesh(iteration == 0);
                }
                
                for (var i = 0; i < this.triangles.length; ++i) {
                    this.triangles[i].isDirty = false;
                }

                var threshold = 0.000000001 * Math.pow((iteration + 3), agressiveness);

                for (var i = 0; i < this.triangles.length; ++i) {

                    var t = this.triangles[i];
                    if (t.error[3] > threshold) continue;
                    if (t.deleted) continue;
                    if (t.isDirty) continue;

                    /*var borderFactor = 0;

                    t.vertices.forEach((id) => { borderFactor += this.vertices[id].isBorder ? 1 : 0; });
                    if (iteration < 25 && borderFactor > 0) continue;
                    if (iteration < 50 && borderFactor > 1) continue;
                    if (iteration < 75 && borderFactor > 2) continue;
                    */
                    for (var j = 0; j < 3; ++j) {
                        if (t.error[j] < threshold) {
                            var deleted0: Array<boolean> = [];
                            var deleted1: Array<boolean> = [];

                            var i0 = t.vertices[j];
                            var i1 = t.vertices[(j + 1) % 3];
                            var v0 = this.vertices[i0];
                            var v1 = this.vertices[i1];

                            if (v0.isBorder != v1.isBorder) continue;

                            var p = BABYLON.Vector3.Zero();
                            var n = BABYLON.Vector3.Zero();
                            var uv = BABYLON.Vector2.Zero();

                            this.calculateError(v0, v1, p, n, uv);

                            if (this.isFlipped(v0, i1, p, deleted0, t.borderFactor)) continue;
                            if (this.isFlipped(v1, i0, p, deleted1, t.borderFactor)) continue;

                            v0.position = p;
                            v0.normal = n;
                            v0.uv = uv;
                            v0.q = v1.q.add(v0.q);
                            var tStart = this.references.length;

                            deletedTriangles = this.updateTriangles(v0.id, v0, deleted0, deletedTriangles);
                            deletedTriangles = this.updateTriangles(v0.id, v1, deleted1, deletedTriangles);

                            var tCount = this.references.length - tStart;

                            if (tCount <= v0.triangleCount) {
                                if (tCount) {
                                    for (var c = 0; c < tCount; c++) {
                                        this.references[v0.triangleStart + c] = this.references[tStart + c];
                                    }
                                }
                            } else {
                                v0.triangleStart = tStart;
                            }

                            v0.triangleCount = tCount;
                            break;
                        }
                    }

                    if (triangleCount - deletedTriangles <= targetCount) break;

                }

            }
        }

        private isFlipped(vertex1: DecimationVertex, index2: number, point: BABYLON.Vector3, deletedArray: Array<boolean>, borderFactor : number): boolean {

            for (var i = 0; i < vertex1.triangleCount; ++i) {
                var t = this.triangles[this.references[vertex1.triangleStart + i].triangleId];
                if (t.deleted) continue;

                var s = this.references[vertex1.triangleStart + i].vertexId;

                var id1 = t.vertices[(s + 1) % 3];
                var id2 = t.vertices[(s + 2) % 3];
                
                if ((id1 == index2 || id2 == index2) && borderFactor < 2) {
                    deletedArray[i] = true;
                    continue;
                }

                var d1 = this.vertices[id1].position.subtract(point);
                d1 = d1.normalize();
                var d2 = this.vertices[id2].position.subtract(point);
                d2 = d2.normalize();
                if (Math.abs(BABYLON.Vector3.Dot(d1, d2)) > 0.999) return true;
                var normal = BABYLON.Vector3.Cross(d1, d2).normalize();
                deletedArray[i] = false;
                if (BABYLON.Vector3.Dot(normal, t.normal) < 0.2) return true;
            }

            return false;
        }
        
        private updateTriangles(vertexId:number, vertex:DecimationVertex, deletedArray:Array<boolean>, deletedTriangles:number) : number {
            var newDeleted = deletedTriangles;
            for (var i = 0; i < vertex.triangleCount; ++i) {
                var ref = this.references[vertex.triangleStart + i];
                var t = this.triangles[ref.triangleId];
                if (t.deleted) continue;
                if (deletedArray[i]) {
                    t.deleted = true;
                    newDeleted++;
                    continue;
                }
                t.vertices[ref.vertexId] = vertexId;
                t.isDirty = true;
                t.error[0] = this.calculateError(this.vertices[t.vertices[0]], this.vertices[t.vertices[1]]) + (t.borderFactor / 2);
                t.error[1] = this.calculateError(this.vertices[t.vertices[1]], this.vertices[t.vertices[2]]) + (t.borderFactor / 2);
                t.error[2] = this.calculateError(this.vertices[t.vertices[2]], this.vertices[t.vertices[0]]) + (t.borderFactor / 2);
                t.error[3] = Math.min(t.error[0], t.error[1], t.error[2]);
                this.references.push(ref);
            }
            return newDeleted; 
        }
        
        private init() {
            console.log("init!");
            for (var i = 0; i < this.triangles.length; ++i) {
                var t = this.triangles[i];
                var pArray = [];
                for (var j = 0; j < 3; j++) {
                    pArray.push(this.vertices[t.vertices[j]].position);
                }
                var normal = BABYLON.Vector3.Cross(pArray[1].subtract(pArray[0]), pArray[2].subtract(pArray[0]));
                t.normal = normal.normalize();
                for (var j = 0; j < 3; j++) {
                    this.vertices[t.vertices[j]].q.addInPlace(DecimationMatrix.FromData(t.normal.x, t.normal.y, t.normal.z, -(BABYLON.Vector3.Dot(t.normal, pArray[0]))));
                }
            }
            for (var i = 0; i < this.triangles.length; ++i) {
                var t = this.triangles[i];
                for (j = 0; j < 3; ++j) {
                    t.error[j] = this.calculateError(this.vertices[t.vertices[j]], this.vertices[t.vertices[(j + 1) % 3]]);
                }
                t.error[3] = Math.min(t.error[0], t.error[1], t.error[2]);
            }
        }

        private identifyBorder() {

            //a very slow function to detect borders. Very NOT optimized...
            /*var borderMap = [];

            for (var i = 0; i < this.triangles.length; ++i) {
                var t = this.triangles[i];
                for (var j = 0; j < 2; ++j) {
                    var v1 = t.vertices[j]
                    var v2 = t.vertices[(j + 1)];
                    var found = borderMap.filter((item) => {
                        return (item.v[0] == v1 && item.v[1] == v2) || (item.v[0] == v2 && item.v[1] == v1)
                    });
                    if (found.length > 1) {
                        console.log("something went wrong");
                    }
                    if (found.length == 0) {
                        borderMap.push({ v: [t.vertices[j], t.vertices[(j + 1) % 3]], t: [i] })
                    } else {
                        found[0].t.push(i);
                    }
                }
            }

            for (var i = 0; i < borderMap.length; ++i) {
                var item = borderMap[i];
                if (item.t.length == 1) {
                    this.triangles[item.t[0]].borderFactor++;
                }
            }*/

            for (var i = 0; i < this.vertices.length; ++i) {
                var vCount: Array<number> = [];
                var vId: Array<number> = [];
                var v = this.vertices[i];
                for (var j = 0; j < v.triangleCount; ++j) {
                    var triangle = this.triangles[this.references[v.triangleStart + j].triangleId];
                    for (var ii = 0; ii < 3; ii++) {
                        var ofs = 0;
                        var id = triangle.vertices[ii];
                        while (ofs < vCount.length) {
                            if (vId[ofs] === id) break;
                            ++ofs;
                        }
                        if (ofs == vCount.length) {
                            vCount.push(1);
                            vId.push(id);
                        } else {
                            vCount[ofs]++;
                        }
                    }
                }

                for (var j = 0; j < vCount.length; ++j) {
                    if (vCount[j] == 1) {
                        this.vertices[vId[j]].isBorder = true;
                    } else {
                        this.vertices[vId[j]].isBorder = false;
                    }
                }

            }
        }

        private updateMesh(init: boolean = false) {
            console.log("updating mesh", init);
            if (!init) {
                var dst = 0;
                var newTrianglesVector: Array<DecimationTriangle> = [];
                for (var i = 0; i < this.triangles.length; ++i) {
                    if (!this.triangles[i].deleted) {
                        newTrianglesVector.push(this.triangles[i]);
                    } 
                }
                this.triangles = newTrianglesVector;
            } 

            for (var i = 0; i < this.vertices.length; ++i) {
                this.vertices[i].triangleCount = 0;
                this.vertices[i].triangleStart = 0;
            }

            for (var i = 0; i < this.triangles.length; ++i) {
                var t = this.triangles[i];
                for (var j = 0; j < 3; ++j) {
                    var v = this.vertices[t.vertices[j]];
                    v.triangleCount++;
                }
            }

            var tStart = 0;

            for (var i = 0; i < this.vertices.length; ++i) {
                this.vertices[i].triangleStart = tStart;
                tStart += this.vertices[i].triangleCount;
                this.vertices[i].triangleCount = 0;
            }

            var newReferences: Array<Reference> = new Array(this.triangles.length * 3);
            for (var i = 0; i < this.triangles.length; ++i) {
                var t = this.triangles[i];
                for (var j = 0; j < 3; ++j) {
                    var v = this.vertices[t.vertices[j]];
                    newReferences[v.triangleStart + v.triangleCount] = new Reference(j, i);
                    v.triangleCount++;
                }
            }
            this.references = newReferences;
              
            if (init) {
                this.identifyBorder();
            }
        }


        private vertexError(q: DecimationMatrix, point: BABYLON.Vector3): number {
            var x = point.x;
            var y = point.y;
            var z = point.z;
            return q.data[0] * x * x + 2 * q.data[1] * x * y + 2 * q.data[2] * x * z + 2 * q.data[3] * x + q.data[4] * y * y
                + 2 * q.data[5] * y * z + 2 * q.data[6] * y + q.data[7] * z * z + 2 * q.data[8] * z + q.data[9];
        }

        private calculateError(vertex1: DecimationVertex, vertex2: DecimationVertex, pointResult?: BABYLON.Vector3, normalResult?: BABYLON.Vector3, uvResult?: BABYLON.Vector2): number {
            var q = vertex1.q.add(vertex2.q);
            var border = vertex1.isBorder && vertex2.isBorder;
            var error: number = 0;
            var qDet = q.det(0, 1, 2, 1, 4, 5, 2, 5, 7);

            

            if (qDet != 0 && !border) {
                if (!pointResult) {
                    pointResult = BABYLON.Vector3.Zero();
                }
                pointResult.x = -1 / qDet * (q.det(1, 2, 3, 4, 5, 6, 5, 7, 8));
                pointResult.y = 1 / qDet * (q.det(0, 2, 3, 1, 5, 6, 2, 7, 8));	
                pointResult.z = -1 / qDet * (q.det(0, 1, 3, 1, 4, 6, 2, 5, 8));	
                error = this.vertexError(q, pointResult);
                //TODO improve this
                if (normalResult) {
                    normalResult.copyFrom(vertex1.normal);
                    uvResult.copyFrom(vertex1.uv);
                }
            } else {
                var p3 = (vertex1.position.add(vertex2.position)).divide(new BABYLON.Vector3(2, 2, 2));
                var norm3 = (vertex1.normal.add(vertex2.normal)).divide(new BABYLON.Vector3(2, 2, 2)).normalize();
                var error1 = this.vertexError(q, vertex1.position);
                var error2 = this.vertexError(q, vertex2.position);
                var error3 = this.vertexError(q, p3);
                error = Math.min(error1, error2, error3);
                if (error === error1) {
                    if (pointResult) {
                        pointResult.copyFrom(vertex1.position);
                        normalResult.copyFrom(vertex1.normal);
                        uvResult.copyFrom(vertex1.uv);
                    }
                } else if (error === error2) {
                    if (pointResult) {
                        pointResult.copyFrom(vertex2.position);
                        normalResult.copyFrom(vertex2.normal);
                        uvResult.copyFrom(vertex2.uv);
                    }
                } else {
                    if (pointResult) {
                        pointResult.copyFrom(p3);
                        normalResult.copyFrom(norm3);
                        uvResult.copyFrom(vertex1.uv);
                    }
                }
            }

            //console.log(error, pointResult);

            return error;
        }
    }
} 