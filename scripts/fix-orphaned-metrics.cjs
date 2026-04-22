/**
 * Fix orphaned campaign_metrics after deduplication.
 * 
 * Problem: MANUS deleted duplicate campaign records, but campaign_metrics
 * still references the deleted campaign IDs → all metrics show zero.
 * 
 * Solution:
 * 1. Delete orphaned campaign_metrics (pointing to non-existent campaigns)
 * 2. Add unique index to prevent future duplicates
 * 3. Force re-sync of all active accounts
 */
const mysql = require('mysql2/promise');

async function fixOrphanedMetrics() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  try {
    console.log('=== FIX ORPHANED CAMPAIGN METRICS ===\n');
    
    // Step 1: Count orphaned metrics
    const [orphanCount] = await connection.execute(
      'SELECT COUNT(*) as cnt FROM campaign_metrics WHERE campaignId NOT IN (SELECT id FROM campaigns)'
    );
    console.log(`Orphaned campaign_metrics records: ${orphanCount[0].cnt}`);
    
    // Step 2: Count total metrics
    const [totalMetrics] = await connection.execute('SELECT COUNT(*) as cnt FROM campaign_metrics');
    console.log(`Total campaign_metrics records: ${totalMetrics[0].cnt}`);
    
    // Step 3: Count valid metrics
    const [validMetrics] = await connection.execute(
      'SELECT COUNT(*) as cnt FROM campaign_metrics WHERE campaignId IN (SELECT id FROM campaigns)'
    );
    console.log(`Valid campaign_metrics records: ${validMetrics[0].cnt}`);
    
    // Step 4: Delete orphaned metrics
    if (orphanCount[0].cnt > 0) {
      console.log(`\nDeleting ${orphanCount[0].cnt} orphaned records...`);
      await connection.execute(
        'DELETE FROM campaign_metrics WHERE campaignId NOT IN (SELECT id FROM campaigns)'
      );
      console.log('✅ Orphaned metrics deleted');
    } else {
      console.log('✅ No orphaned metrics found');
    }
    
    // Step 5: Add unique index on campaigns (if not exists)
    try {
      await connection.execute(
        'ALTER TABLE campaigns ADD UNIQUE INDEX uq_meta_campaign_account (metaCampaignId, accountId)'
      );
      console.log('✅ Unique index added to campaigns(metaCampaignId, accountId)');
    } catch (e) {
      if (e.message.includes('Duplicate')) {
        // If there are still duplicates, clean them first
        console.log('Found remaining duplicates, cleaning...');
        await connection.execute(
          'DELETE c1 FROM campaigns c1 INNER JOIN campaigns c2 ON c1.metaCampaignId = c2.metaCampaignId AND c1.accountId = c2.accountId AND c1.id > c2.id'
        );
        await connection.execute(
          'ALTER TABLE campaigns ADD UNIQUE INDEX uq_meta_campaign_account (metaCampaignId, accountId)'
        );
        console.log('✅ Duplicates cleaned and unique index added');
      } else if (e.message.includes('Duplicate key name') || e.message.includes('already exists')) {
        console.log('✅ Unique index already exists');
      } else {
        console.error('Index error:', e.message);
      }
    }
    
    // Step 6: Verify final state
    const [campaigns] = await connection.execute('SELECT COUNT(*) as cnt FROM campaigns');
    const [metrics] = await connection.execute('SELECT COUNT(*) as cnt FROM campaign_metrics');
    const [accounts] = await connection.execute(
      'SELECT COUNT(*) as cnt FROM meta_ad_accounts WHERE isActive = 1'
    );
    
    console.log(`\n=== FINAL STATE ===`);
    console.log(`Campaigns: ${campaigns[0].cnt}`);
    console.log(`Campaign metrics: ${metrics[0].cnt}`);
    console.log(`Active accounts: ${accounts[0].cnt}`);
    
    // Step 7: Check which campaigns have metrics
    const [withMetrics] = await connection.execute(
      'SELECT c.accountId, COUNT(DISTINCT c.id) as campaigns, COUNT(cm.id) as metrics FROM campaigns c LEFT JOIN campaign_metrics cm ON cm.campaignId = c.id GROUP BY c.accountId'
    );
    console.log('\nMetrics per account:');
    for (const row of withMetrics) {
      console.log(`  Account ${row.accountId}: ${row.campaigns} campaigns, ${row.metrics} metric records`);
    }
    
    console.log('\n✅ Fix complete. Now run a full sync to repopulate metrics.');
    console.log('Run: node -e "require(\'./dist/autoSync\').startAutoSync()"');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

fixOrphanedMetrics();
