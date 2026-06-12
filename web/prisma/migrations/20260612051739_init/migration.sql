-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "rankedFile" TEXT,
    "verdictFile" TEXT,
    "videoPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetResource" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "rule" TEXT,
    "assetCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelectedAsset" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "publicPath" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SelectedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_slug_idx" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "AssetResource_productId_idx" ON "AssetResource"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetResource_productId_resourceId_key" ON "AssetResource"("productId", "resourceId");

-- CreateIndex
CREATE INDEX "SelectedAsset_productId_idx" ON "SelectedAsset"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SelectedAsset_productId_publicPath_key" ON "SelectedAsset"("productId", "publicPath");

-- AddForeignKey
ALTER TABLE "AssetResource" ADD CONSTRAINT "AssetResource_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectedAsset" ADD CONSTRAINT "SelectedAsset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
