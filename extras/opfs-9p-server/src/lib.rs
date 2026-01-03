use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use tokio_fs_ext::{File, OpenOptions, metadata, create_dir, read_dir, remove_file, remove_dir, rename};
use web_sys::FileSystemReadWriteOptions;

#[wasm_bindgen]
pub struct JsStat {
    pub size: u64,
    pub is_directory: bool,
    pub mtime: u64, // simplified
}

#[wasm_bindgen]
pub struct JsDirEntry {
    name: String,
    pub is_directory: bool,
}

#[wasm_bindgen]
impl JsDirEntry {
    #[wasm_bindgen(getter)]
    pub fn name(&self) -> String {
        self.name.clone()
    }
}

#[wasm_bindgen]
pub struct OpfsVirtioDevice {
    files: HashMap<u64, File>,
    next_fid: u64,
}

#[wasm_bindgen]
impl OpfsVirtioDevice {
    #[wasm_bindgen(constructor)]
    pub async fn new() -> Result<OpfsVirtioDevice, JsValue> {
        console_error_panic_hook::set_once();
        Ok(Self {
            files: HashMap::new(),
            next_fid: 1,
        })
    }

    pub async fn open(&mut self, path: &str, flags: u32) -> Result<u64, JsValue> {
        let mut options = OpenOptions::new();
        
        // flags: 0=READ, 1=WRITE, 2=RDWR
        if (flags & 1) != 0 {
            options.write(true);
            options.create(true);
        } else if (flags & 2) != 0 {
             options.read(true).write(true).create(true);
        } else {
            options.read(true);
        }

        let file = options.open(path).await.map_err(|e| JsValue::from_str(&e.to_string()))?;
        
        let fid = self.next_fid;
        self.next_fid += 1;
        self.files.insert(fid, file);
        Ok(fid)
    }

    pub fn read(&mut self, fid: u64, offset: u64, count: u32) -> Result<Vec<u8>, JsValue> {
        let file = self.files.get_mut(&fid).ok_or_else(|| JsValue::from_str("Invalid FID"))?;
        let mut buf = vec![0u8; count as usize];
        
        let options = FileSystemReadWriteOptions::new();
        options.set_at(offset as f64);
        
        let handle = &file.sync_access_handle;
        let bytes_read = handle.read_with_u8_array_and_options(&mut buf, &options)
            .map_err(|e| JsValue::from_str(&format!("{:?}", e)))?;
            
        buf.truncate(bytes_read as usize);
        Ok(buf)
    }

    pub fn write(&mut self, fid: u64, offset: u64, data: &[u8]) -> Result<u32, JsValue> {
        let file = self.files.get_mut(&fid).ok_or_else(|| JsValue::from_str("Invalid FID"))?;
        
        let options = FileSystemReadWriteOptions::new();
        options.set_at(offset as f64);
        
        let handle = &file.sync_access_handle;
        let written = handle.write_with_u8_array_and_options(data, &options)
            .map_err(|e| JsValue::from_str(&format!("{:?}", e)))?;
            
        Ok(written as u32)
    }
    
    pub fn close(&mut self, fid: u64) -> Result<(), JsValue> {
        if self.files.remove(&fid).is_some() {
            Ok(())
        } else {
            Err(JsValue::from_str("Invalid FID"))
        }
    }
    
    pub fn size(&self, fid: u64) -> Result<f64, JsValue> {
         let file = self.files.get(&fid).ok_or_else(|| JsValue::from_str("Invalid FID"))?;
         file.sync_access_handle.get_size().map_err(|e| JsValue::from_str(&format!("{:?}", e)))
    }
    
    pub fn flush(&self, fid: u64) -> Result<(), JsValue> {
         let file = self.files.get(&fid).ok_or_else(|| JsValue::from_str("Invalid FID"))?;
         file.sync_access_handle.flush().map_err(|e| JsValue::from_str(&format!("{:?}", e)))
    }
    
    // Additional Filesystem Operations
    
    pub async fn stat(&self, path: &str) -> Result<JsStat, JsValue> {
        let meta = metadata(path).await.map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(JsStat {
            size: meta.len(),
            is_directory: meta.is_dir(),
            mtime: 0, // simplified
        })
    }
    
    pub async fn mkdir(&self, path: &str) -> Result<(), JsValue> {
        create_dir(path).await.map_err(|e| JsValue::from_str(&e.to_string()))
    }
    
    pub async fn unlink(&self, path: &str) -> Result<(), JsValue> {
        remove_file(path).await.map_err(|e| JsValue::from_str(&e.to_string()))
    }
    
    pub async fn rmdir(&self, path: &str) -> Result<(), JsValue> {
        remove_dir(path).await.map_err(|e| JsValue::from_str(&e.to_string()))
    }
    
    pub async fn rename(&self, from: &str, to: &str) -> Result<(), JsValue> {
        rename(from, to).await.map_err(|e| JsValue::from_str(&e.to_string()))
    }
    
    pub async fn readdir(&self, path: &str) -> Result<Box<[JsValue]>, JsValue> {
        let entries = read_dir(path).await.map_err(|e| JsValue::from_str(&e.to_string()))?;
        let mut result = Vec::new();
        
        for entry in entries {
            let entry = entry.map_err(|e| JsValue::from_str(&e.to_string()))?;
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().map_err(|e| JsValue::from_str(&e.to_string()))?.is_dir();
            
            let js_entry = JsDirEntry {
                name,
                is_directory: is_dir,
            };
            result.push(JsValue::from(js_entry));
        }
        
        Ok(result.into_boxed_slice())
    }
    
    pub async fn exists(&self, path: &str) -> Result<bool, JsValue> {
        tokio_fs_ext::try_exists(path).await.map_err(|e| JsValue::from_str(&e.to_string()))
    }
}