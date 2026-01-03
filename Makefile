CMD_DESTDIR ?= /usr/local
PREFIX ?= $(CURDIR)/out/

PKG=github.com/ktock/container2wasm
VERSION=$(shell git describe --match 'v[0-9]*' --dirty='.m' --always --tags)
REVISION=$(shell git rev-parse HEAD)$(shell if ! git diff --no-ext-diff --quiet --exit-code; then echo .m; fi)
GO_EXTRA_LDFLAGS=-extldflags '-static'
GO_LD_FLAGS=-ldflags '-s -w -X $(PKG)/version.Version=$(VERSION) -X $(PKG)/version.Revision=$(REVISION) $(GO_EXTRA_LDFLAGS)'
GO_BUILDTAGS=-tags "osusergo netgo static_build"
GO_MODULE_DIRS=$(shell find . -type f -name go.mod -exec dirname {} \;)

all: c2w c2w-net

build: c2w c2w-net

c2w:
	CGO_ENABLED=0 go build -o $(PREFIX)/c2w $(GO_LD_FLAGS) $(GO_BUILDTAGS) -v ./cmd/c2w

c2w-net:
	CGO_ENABLED=0 go build -o $(PREFIX)/c2w-net $(GO_LD_FLAGS) $(GO_BUILDTAGS) -v ./cmd/c2w-net

c2w-net-proxy.wasm:
	cd extras/c2w-net-proxy/ ; GOOS=wasip1 GOARCH=wasm go build -o $(PREFIX)/c2w-net-proxy.wasm .

imagemounter.wasm:
	cd extras/imagemounter ; GOOS=wasip1 GOARCH=wasm go build -o $(PREFIX)/imagemounter.wasm .

install:
	@if [ "$$(uname -s)" = "Darwin" ]; then \
		install -m 755 $(PREFIX)/c2w $(CMD_DESTDIR)/bin; \
		install -m 755 $(PREFIX)/c2w-net $(CMD_DESTDIR)/bin; \
	else \
		install -D -m 755 $(PREFIX)/c2w $(CMD_DESTDIR)/bin; \
		install -D -m 755 $(PREFIX)/c2w-net $(CMD_DESTDIR)/bin; \
	fi

artifacts: clean
	GOOS=linux GOARCH=amd64 make c2w c2w-net
	tar -C $(PREFIX) --owner=0 --group=0 -zcvf $(PREFIX)/container2wasm-$(VERSION)-linux-amd64.tar.gz c2w c2w-net

	GOOS=linux GOARCH=arm64 make c2w c2w-net
	tar -C $(PREFIX) --owner=0 --group=0 -zcvf $(PREFIX)/container2wasm-$(VERSION)-linux-arm64.tar.gz c2w c2w-net

	rm -f $(PREFIX)/c2w $(PREFIX)/c2w-net


test:
	./tests/test.sh

benchmark:
	./tests/bench.sh

vendor:
	$(foreach dir,$(GO_MODULE_DIRS),(cd $(dir) && go mod tidy) || exit 1;)

validate-vendor:
	$(eval TMPDIR := $(shell mktemp -d))
	cp -R $(CURDIR) ${TMPDIR}
	(cd ${TMPDIR}/container2wasm && make vendor)
	diff -r -u -q $(CURDIR) ${TMPDIR}/container2wasm
	rm -rf ${TMPDIR}

clean:
	rm -f $(CURDIR)/out/*

# ============================================================ 
# OPFS Integration Targets
# ============================================================ 

OPFS_9P_DIR = extras/opfs-9p-server
V86_REPO = https://github.com/copy/v86.git
HTDOCS = examples/wasi-browser/htdocs

.PHONY: opfs-deps opfs-l1 opfs-m1 opfs-all opfs-clean

# Install all OPFS dependencies
opfs-deps:
	@echo "happy-opfs will be fetched via importmap from esm.sh"
	@# No npm install needed as happy-opfs is imported directly via URL in browser

# Build L1 (Rust 9P server)
opfs-l1:
	cd $(OPFS_9P_DIR) && wasm-pack build --target web --release
	mkdir -p $(HTDOCS)/opfs-9p-server
	cp -r $(OPFS_9P_DIR)/pkg/* $(HTDOCS)/opfs-9p-server/

# Setup M1 (v86 9P files)
opfs-m1:
	@if [ ! -d "/tmp/v86" ]; then \
		git clone --depth 1 $(V86_REPO) /tmp/v86; \
	fi
	cp /tmp/v86/lib/9p.js $(HTDOCS)/
	cp /tmp/v86/lib/marshall.js $(HTDOCS)/
	cp /tmp/v86/lib/filesystem.js $(HTDOCS)/

# Build everything
opfs-all: opfs-deps opfs-m1 opfs-l1
	@echo "OPFS integration complete"
	@echo "  S1: happy-opfs installed"
	@echo "  M1: v86 9P files copied"
	@echo "  L1: Rust 9P server built"

# Clean OPFS artifacts

opfs-clean:

	rm -rf $(HTDOCS)/opfs-9p-server

	rm -f $(HTDOCS)/9p.js $(HTDOCS)/marshall.js $(HTDOCS)/filesystem.js

	rm -rf /tmp/v86



# Rebuild init and c2w, then show command to re-generate wasm

rebuild-image-with-opfs: c2w
	@echo "Pruning docker cache..."
	docker builder prune -a -f
	@echo "Running c2w conversion..."
	./out/c2w --assets $(CURDIR) --target-arch=riscv64 ubuntu:22.04 $(PREFIX)/htdocs
